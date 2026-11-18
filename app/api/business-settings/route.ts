import type { CustomField } from '../../../src/domain/business-settings';
import demoProducts from '../../../src/infrastructure/catalogue/demo-products.json';
import { securityEvent } from '../../../src/infrastructure/security/audit';
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
import { initData, pool } from '../../../src/infrastructure/db';
import { lockEntities, writeEntities } from '../../../src/infrastructure/entity-store';
import {
  defaultSettings,
  settingsOrDefault,
  validateConfigurationChange,
} from '../../../src/domain/business-settings';
import { validBrand } from '../../../src/domain/workspace';
import { seed } from '../../../src/domain/model';
export async function GET() {
  const u = await currentUser();
  if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
  return json({
    settings: settingsOrDefault(u.workspace?.settings),
    version: u.workspace?.version,
    brand: u.workspace?.brand,
  });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
  const u = await currentUser();
  if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
  if (!u.platformDeveloper)
    return json({ error: 'Solo el desarrollador configura el negocio' }, 403);
  if (!matchesWorkspace(req, u)) return json({ error: 'El espacio ha cambiado' }, 409);
  try {
    const b = await readJsonObject(req, 400000);
    await initData();
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const state = (await lockEntities(db)).rows[0];
      const w = (
        await db.query('SELECT * FROM public.crm_workspaces WHERE id=$1 FOR UPDATE', [
          u.workspaceId,
        ])
      ).rows[0];
      if (w.version !== b.version) {
        await db.query('ROLLBACK');
        return json({ error: 'La configuración ha cambiado. Vuelve a abrirla.' }, 409);
      }
      validateConfigurationChange(settingsOrDefault(w.settings), b.settings, state.data);
      const cleaned = structuredClone(state.data);
      let cleanEmpty = false;
      for (const entity of ['companies', 'contacts', 'deals'] as const)
        for (const row of cleaned[entity])
          for (const [id, value] of Object.entries(row.customFields || {})) {
            if (
              value === '' &&
              !b.settings.fields.some((f: CustomField) => f.id === id && f.entity === entity)
            ) {
              delete row.customFields![id];
              cleanEmpty = true;
            }
          }
      if (cleanEmpty) await writeEntities(db, state.data, cleaned);
      const brand = b.brand || w.brand;
      if (!validBrand(brand)) throw Error('Revisa nombre, logo, colores y moneda');
      if (brand.logo.startsWith('data:')) {
        const bytes = Buffer.from(brand.logo.split(',')[1] || '', 'base64');
        const valid = brand.logo.startsWith('data:image/png;')
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : brand.logo.startsWith('data:image/jpeg;')
            ? bytes[0] === 255 && bytes[1] === 216
            : bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP';
        if (!valid) throw Error('El archivo del logo no es una imagen válida');
      }
      if (
        (brand.currency || 'EUR') !== (w.brand.currency || 'EUR') &&
        state.data.deals.some((d: any) => d.versions.length)
      )
        throw Error(
          'No se puede cambiar la moneda con presupuestos emitidos. Crea otro espacio para otra moneda.',
        );
      if (b.initialData && !['empty', 'examples', 'keep'].includes(b.initialData))
        throw Error('Selección de datos no válida');
      if (b.initialData && b.initialData !== 'keep') {
        if (w.settings?.setupComplete)
          throw Error('La configuración inicial ya terminó; no se pueden sustituir los datos');
        const data = state.data;
        const occupied = [
          'companies',
          'contacts',
          'deals',
          'orders',
          'tasks',
          'notes',
          'works',
          'workers',
          'siteReports',
          'laborReports',
        ].some((k) => data[k as keyof typeof data]?.length);
        const catalogueUsed =
          Number((await db.query('SELECT count(*) FROM crm_products')).rows[0].count) > 0;
        if (occupied || catalogueUsed)
          throw Error(
            'Este espacio ya tiene datos. Elige conservarlos; no se borrará ningún registro.',
          );
        if (b.initialData === 'examples') {
          const next = seed();
          for (const c of next.companies) c.owner = u.username;
          for (const d of next.deals) d.owner = u.username;
          for (const t of next.tasks) t.owner = u.username;
          await writeEntities(db, data, next);
          await db.query(
            `INSERT INTO crm_products(code,name,family,price,description,active) SELECT code,name,family,price,description,active FROM jsonb_to_recordset($1::jsonb) AS p(code text,name text,family text,price numeric,description text,active boolean) ON CONFLICT(code) DO NOTHING`,
            [JSON.stringify(demoProducts)],
          );
        }
      }
      await db.query(
        'UPDATE public.crm_workspaces SET name=$1,brand=$2,settings=$3,version=version+1 WHERE id=$4',
        [brand.name, brand, b.settings, u.workspaceId],
      );
      await db.query('UPDATE crm_state_meta SET version=version+1 WHERE id=1');
      await securityEvent(
        { actor: u.id, workspace: u.workspaceId, event: 'business.settings.updated' },
        db,
      );
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
      { error: e instanceof Error ? e.message : 'No se pudo guardar' },
      e instanceof RequestInputError ? e.status : 422,
    );
  }
}
