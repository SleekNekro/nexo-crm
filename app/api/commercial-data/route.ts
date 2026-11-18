import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
import { initData, pool } from '../../../src/infrastructure/db';
import { lockEntities, writeEntities } from '../../../src/infrastructure/entity-store';
import { canAct, canView } from '../../../src/domain/permissions';
import { isAdmin } from '../../../src/domain/roles';
import { validData } from '../../../src/domain/actions';
import { validateBusinessChange } from '../../../src/application/business-rules';
import { previewImport, applyImport } from '../../../src/domain/commercial-import';
import { mergeCommercial } from '../../../src/domain/commercial-merge';
import { baselineSales, recordSales } from '../../../src/infrastructure/sales-storage';
import { memberDirectory } from '../../../src/infrastructure/member-directory';
import type { Identity } from '../../../src/application/access';
const allModules = (u: Identity) =>
  isAdmin(u.role) &&
  !u.mustChange &&
  canAct(u, 'companies') &&
  ['Empresas', 'Contactos', 'Tratos', 'Presupuestos', 'Actividades', 'Pedidos'].every((v) =>
    canView(u, v),
  );
const allowed = (u: Identity) =>
  isAdmin(u.role) && !u.mustChange && canAct(u, 'companies') && canView(u, 'Empresas');
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  if (!allModules(user))
    return json(
      { error: 'Se necesita acceso a todos los módulos comerciales para ver esta auditoría' },
      403,
    );
  if (!matchesWorkspace(req, user))
    return json({ error: 'El espacio ha cambiado. Vuelve a abrir la herramienta.' }, 409);
  try {
    await initData();
    const before = new URL(req.url).searchParams.get('before');
    if (before && !/^\d+$/.test(before)) return json({ error: 'Página no válida' }, 400);
    const r = await pool.query(
      'SELECT * FROM crm_commercial_data_audit WHERE ($1::bigint IS NULL OR id<$1::bigint) ORDER BY id DESC LIMIT 21',
      [before],
    );
    return json({ events: r.rows.slice(0, 20), more: r.rows.length > 20 });
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    return json({ error: 'No se pudo consultar el historial' }, 503);
  }
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
  const user = await currentUser();
  if (!user) return json({ error: 'Inicia sesión' }, 401);
  if (!allowed(user)) return json({ error: 'Solo administradores con permiso de empresas' }, 403);
  if (!matchesWorkspace(req, user))
    return json({ error: 'El espacio ha cambiado. Vuelve a abrir la herramienta.' }, 409);
  let b;
  try {
    b = await readJsonObject(req, 1300000);
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    return json({ error: 'Petición no válida' }, 400);
  }
  if (
    !b ||
    !['import', 'merge'].includes(b.action) ||
    !['companies', 'contacts'].includes(b.kind) ||
    typeof b.preview !== 'boolean'
  )
    return json({ error: 'Operación no válida' }, 400);
  if (
    (b.action === 'merge' && !allModules(user)) ||
    (b.kind === 'contacts' && !canView(user, 'Contactos'))
  )
    return json(
      { error: 'Activa los módulos necesarios y revisa tus permisos antes de esta operación' },
      403,
    );
  await initData();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const state = (await lockEntities(db)).rows[0],
      before = state.data;
    if (!b.preview && b.version !== state.version) {
      await db.query('ROLLBACK');
      return json(
        { error: 'Los datos han cambiado. Genera otra vista previa antes de guardar.' },
        409,
      );
    }
    let next = before,
      detail: unknown,
      targetId: string | null = null,
      sourceId: string | null = null;
    if (b.action === 'import') {
      if (b.kind === 'companies') {
        const accounts = await db.query(
          `SELECT CASE WHEN role IN ('admin','developer') THEN username ELSE profile END AS profile FROM (${memberDirectory}) d WHERE active AND role IN ('admin','developer','commercial')`,
          [user.workspaceId],
        );
        if (!accounts.rows.some((a) => a.profile === b.owner))
          throw Error('Selecciona un responsable activo para las empresas.');
      }
      const rows = previewImport(before, b.csv, b.kind, b.mapping, b.owner);
      if (b.preview) {
        await db.query('ROLLBACK');
        return json({
          version: state.version,
          rows: rows.map(({ record, ...row }) => ({ ...row, values: record })),
        });
      }
      next = applyImport(before, rows, b.selected, () => crypto.randomUUID());
      validateBusinessChange(before, next);
      detail = {
        count: b.selected.length,
        records:
          b.kind === 'companies'
            ? next.companies.filter((c) => !before.companies.some((o) => o.id === c.id))
            : next.contacts.filter((c) => !before.contacts.some((o) => o.id === c.id)),
      };
      await recordSales(db, before, next, user.id);
      if (b.kind === 'companies')
        for (const c of next.companies.filter(
          (c) => !before.companies.some((o) => o.id === c.id) && c.status === 'Cliente activo',
        ))
          await db.query('UPDATE client_lifecycle SET active=true WHERE company_id=$1', [c.id]);
    } else {
      const plan = mergeCommercial(before, b.kind, b.sourceId, b.targetId, b.choices);
      next = plan.next;
      const companyNotes =
        b.kind === 'companies'
          ? Number(
              (
                await db.query('SELECT count(*) FROM crm_company_notes WHERE company_id=$1', [
                  b.sourceId,
                ])
              ).rows[0].count,
            )
          : 0;
      // A merge is a constrained server command, not a generic edit bypass. Validate final graph,
      // while ordinary edits continue forbidding deletion/reassignment of issued documents.
      validateBusinessChange(next, next);
      if (b.preview) {
        await db.query('ROLLBACK');
        return json({
          version: state.version,
          source: plan.source,
          target: plan.target,
          result: plan.result,
          impact: { ...plan.impact, companyNotes },
        });
      }
      targetId = b.targetId;
      sourceId = b.sourceId;
      detail = {
        source: plan.source,
        targetBefore: plan.target,
        result: plan.result,
        impact: { ...plan.impact, companyNotes },
        choices: b.choices || {},
        dealIds: before.deals
          .filter((d) =>
            b.kind === 'companies' ? d.companyId === sourceId : d.contactId === sourceId,
          )
          .map((d) => d.id),
      };
      if (b.kind === 'companies') {
        await db.query('UPDATE crm_company_notes SET company_id=$2 WHERE company_id=$1', [
          sourceId,
          targetId,
        ]);
        await baselineSales(db, before);
        await db.query(
          `INSERT INTO client_lifecycle(company_id,active,activated_at) SELECT $2,bool_or(active),min(activated_at) FROM client_lifecycle WHERE company_id=ANY($1::text[]) ON CONFLICT(company_id) DO UPDATE SET active=EXCLUDED.active,activated_at=EXCLUDED.activated_at`,
          [[sourceId, targetId], targetId],
        );
        await db.query('DELETE FROM client_lifecycle WHERE company_id=$1', [sourceId]);
        await db.query(
          `UPDATE sales_events SET company_id=$2,entity_id=CASE WHEN kind IN ('company_created','client_activated') AND entity_id=$1 THEN $2 ELSE entity_id END WHERE company_id=$1`,
          [sourceId, targetId],
        );
      }
      await db.query(
        'UPDATE crm_commercial_data_audit SET target_id=$2 WHERE kind=$3 AND target_id=$1',
        [sourceId, targetId, b.kind],
      );
    }
    if (!validData(next))
      throw Error('La operación produciría datos no válidos. No se ha guardado nada.');
    await writeEntities(db, before, next);
    await db.query(
      'INSERT INTO crm_commercial_data_audit(actor_id,actor_name,action,kind,target_id,source_id,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        user.id,
        user.displayName || user.username,
        b.action,
        b.kind,
        targetId,
        sourceId,
        JSON.stringify(detail),
      ],
    );
    await db.query('UPDATE crm_state_meta SET version=version+1 WHERE id=1');
    await db.query('COMMIT');
    return json({ ok: true, version: state.version + 1 });
  } catch (e) {
    await db.query('ROLLBACK');
    return json({ error: (e as Error).message || 'No se ha guardado nada' }, 422);
  } finally {
    db.release();
  }
}
