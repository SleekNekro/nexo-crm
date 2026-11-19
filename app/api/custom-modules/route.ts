import { randomUUID } from 'node:crypto';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import { readEntities } from '../../../src/infrastructure/entity-store';
import { initData, pool, readState } from '../../../src/infrastructure/db';
import { visibleData } from '../../../src/application/access';
import { securityEvent } from '../../../src/infrastructure/security/audit';
import {
  canUseModule,
  validateModule,
  validateModuleChange,
  validateModuleRecord,
  type CustomModule,
  type ModuleRecord,
} from '../../../src/domain/custom-modules';
export const runtime = 'nodejs';
function referencesVisible(m: CustomModule, row: ModuleRecord, visible: any, all: any) {
  return m.fields.every((f) => {
    if (!['company', 'contact'].includes(f.type) || !row.values[f.id]) return true;
    const key = f.type === 'company' ? 'companies' : 'contacts';
    return (
      !all[key].some((x: any) => x.id === row.values[f.id]) ||
      visible[key].some((x: any) => x.id === row.values[f.id])
    );
  });
}
export async function GET(req: Request) {
  try {
    const user = await currentUser();
    if (!user || user.mustChange) return json({ error: 'Inicia sesión' }, 401);
    await initData();
    const definitions = (
      await pool.query('SELECT definition,version FROM crm_custom_modules ORDER BY created_at,id')
    ).rows;
    const id = new URL(req.url).searchParams.get('module');
    if (!id)
      return json({
        modules: definitions.filter(
          (r) => user.platformDeveloper || canUseModule(r.definition, user.role, 'read'),
        ),
      });
    const found = definitions.find((r) => r.definition.id === id);
    if (!found || !canUseModule(found.definition, user.role, 'read'))
      return json({ error: 'Módulo no disponible' }, 403);
    const all = (await readState()).rows[0].data,
      visible = visibleData(all, user);
    const rows = (
      await pool.query(
        'SELECT id,title,payload AS "values",version FROM crm_custom_records WHERE module_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC,id LIMIT 1001',
        [id],
      )
    ).rows;
    return json({
      ...found,
      records: rows
        .slice(0, 1000)
        .filter((r) => referencesVisible(found.definition, r, visible, all)),
      limited: rows.length > 1000,
      companies: visible.companies.map((c) => ({ id: c.id, name: c.name })),
      contacts: visible.contacts.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch {
    return json({ error: 'No se pudieron cargar los módulos.' }, 503);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
  const user = await currentUser();
  if (!user || user.mustChange) return json({ error: 'Inicia sesión' }, 401);
  if (!matchesWorkspace(req, user))
    return json({ error: 'El espacio ha cambiado. Vuelve a abrir el módulo.' }, 409);
  try {
    const body = await readJsonObject(req, 120000);
    if (!['definition', 'record', 'delete'].includes(body.action))
      return json({ error: 'Acción no válida' }, 400);
    if (body.action === 'definition' && !user.platformDeveloper)
      return json({ error: 'Solo el desarrollador puede configurar módulos.' }, 403);
    await initData();
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // Serializes schema changes and record mutations, including concurrent first creation.
      await db.query('LOCK TABLE crm_custom_modules IN SHARE ROW EXCLUSIVE MODE');
      if (body.action === 'definition') {
        validateModule(body.definition);
        const m: CustomModule = body.definition;
        const old = (
          await db.query('SELECT definition,version FROM crm_custom_modules WHERE id=$1', [m.id])
        ).rows[0];
        if ((old?.version || 0) !== body.version) {
          await db.query('ROLLBACK');
          return json({ error: 'El módulo ha cambiado. Vuelve a abrirlo.' }, 409);
        }
        if (old) {
          const rows = (
            await db.query(
              'SELECT id,title,payload AS "values",version FROM crm_custom_records WHERE module_id=$1',
              [m.id],
            )
          ).rows;
          validateModuleChange(old.definition, m, rows);
          await db.query(
            'UPDATE crm_custom_modules SET definition=$2,version=version+1,updated_at=now() WHERE id=$1',
            [m.id, m],
          );
        } else {
          if (
            Number((await db.query('SELECT count(*) FROM crm_custom_modules')).rows[0].count) >= 30
          )
            throw Error('Límite de 30 módulos por empresa.');
          await db.query('INSERT INTO crm_custom_modules(id,definition) VALUES($1,$2)', [m.id, m]);
        }
        await securityEvent(
          {
            actor: user.id,
            workspace: user.workspaceId,
            event: 'custom-module.configured',
            target: m.id,
          },
          db,
        );
      } else {
        if (typeof body.moduleId !== 'string') throw Error('Módulo no válido.');
        const found = (
          await db.query('SELECT definition,version FROM crm_custom_modules WHERE id=$1', [
            body.moduleId,
          ])
        ).rows[0];
        const action = body.action === 'delete' ? 'delete' : body.id ? 'edit' : 'create';
        if (!found || !canUseModule(found.definition, user.role, action)) {
          await db.query('ROLLBACK');
          return json({ error: 'No tienes permiso para esta acción.' }, 403);
        }
        if (found.version !== body.moduleVersion) {
          await db.query('ROLLBACK');
          return json({ error: 'La definición ha cambiado. Vuelve a abrir el módulo.' }, 409);
        }
        const m: CustomModule = found.definition;
        const old = body.id
          ? (
              await db.query(
                'SELECT id,title,payload AS "values",version FROM crm_custom_records WHERE id=$1 AND module_id=$2 AND deleted_at IS NULL FOR UPDATE',
                [body.id, m.id],
              )
            ).rows[0]
          : undefined;
        if (body.id && (!old || old.version !== body.version)) {
          await db.query('ROLLBACK');
          return json({ error: 'El registro ha cambiado o ya no existe. Recarga el módulo.' }, 409);
        }
        const all = (await readEntities(db)).rows[0].data,
          visible = visibleData(all, user);
        if (old && !referencesVisible(m, old, visible, all)) {
          await db.query('ROLLBACK');
          return json({ error: 'No tienes acceso a este registro.' }, 403);
        }
        if (body.action === 'delete') {
          if (!old) throw Error('Selecciona un registro.');
          await db.query(
            'UPDATE crm_custom_records SET deleted_at=now(),updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1',
            [old.id, user.id],
          );
        } else {
          validateModuleRecord(m, body.title, body.values);
          for (const f of m.fields) {
            if (
              f.archived &&
              JSON.stringify(body.values[f.id]) !== JSON.stringify(old?.values[f.id])
            )
              throw Error('Los campos archivados se conservan sin cambios.');
            if (['company', 'contact'].includes(f.type) && body.values[f.id]) {
              const key = f.type === 'company' ? 'companies' : 'contacts';
              if (
                !visible[key].some((x) => x.id === body.values[f.id]) &&
                body.values[f.id] !== old?.values[f.id]
              )
                throw Error(`Selecciona una referencia disponible para «${f.label}».`);
            }
          }
          if (old)
            await db.query(
              'UPDATE crm_custom_records SET title=$2,payload=$3,version=version+1,updated_by=$4,updated_at=now() WHERE id=$1',
              [old.id, body.title.trim(), body.values, user.id],
            );
          else
            await db.query(
              'INSERT INTO crm_custom_records(id,module_id,title,payload,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)',
              [randomUUID(), m.id, body.title.trim(), body.values, user.id],
            );
        }
        await securityEvent(
          {
            actor: user.id,
            workspace: user.workspaceId,
            event: 'custom-module.record.' + action,
            target: body.id || m.id,
          },
          db,
        );
      }
      await db.query('COMMIT');
      return json({ ok: true });
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'No se pudo guardar.' },
      e instanceof RequestInputError ? e.status : 422,
    );
  }
}
