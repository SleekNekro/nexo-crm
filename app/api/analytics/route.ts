import { canView } from '../../../src/domain/permissions';
import { isAdmin } from '../../../src/domain/roles';
import {
  commercialAnalysis,
  previousPeriod,
  type SalesEvent,
} from '../../../src/domain/sales-metrics';
import { initData, pool } from '../../../src/infrastructure/db';
import { lockEntities } from '../../../src/infrastructure/entity-store';
import { baselineSales } from '../../../src/infrastructure/sales-storage';
import { currentUser, json } from '../../../src/infrastructure/security/auth';
export async function GET(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (
      ![
        'Análisis',
        'Empresas',
        'Contactos',
        'Tratos',
        'Presupuestos',
        'Actividades',
        'Pedidos',
      ].every((v) => canView(user, v))
    )
      return json({ error: 'Acceso no permitido' }, 403);
    if (!isAdmin(user.role) || user.mustChange) return json({ error: 'Solo administradores' }, 403);
    const params = new URL(req.url).searchParams,
      from = params.get('from') || new Date().toISOString().slice(0, 8) + '01',
      to = params.get('to') || new Date().toISOString().slice(0, 10);
    const date = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s;
    if (!date(from) || !date(to) || to < from)
      return json({ error: 'Selecciona un periodo válido' }, 400);
    await initData();
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const state = await lockEntities(db, 'SHARE');
      const data = state.rows[0].data;
      await baselineSales(db, data);
      const r = await db.query(
        `SELECT kind,entity_id AS "entityId",company_id AS "companyId",owner,label,from_stage AS "fromStage",to_stage AS "toStage",amount::float8 AS amount,at FROM sales_events WHERE at >= ($1::date::timestamp AT TIME ZONE 'Europe/Madrid') AND at < (($2::date+1)::timestamp AT TIME ZONE 'Europe/Madrid') ORDER BY at,id`,
        [from, to],
      );
      const prior = previousPeriod(from, to);
      const previous = await db.query(
        `SELECT kind,entity_id AS "entityId",company_id AS "companyId",owner,label,from_stage AS "fromStage",to_stage AS "toStage",amount::float8 AS amount,at FROM sales_events WHERE at >= ($1::date::timestamp AT TIME ZONE 'Europe/Madrid') AND at < (($2::date+1)::timestamp AT TIME ZONE 'Europe/Madrid') ORDER BY at,id`,
        [prior.from, prior.to],
      );
      const creations = await db.query(
        "SELECT entity_id,min(at) AS at FROM sales_events WHERE kind='deal_created' GROUP BY entity_id",
      );
      const creationDates = Object.fromEntries(
        creations.rows.map((x) => [x.entity_id, x.at.toISOString()]),
      );
      const events = r.rows.map((x) => ({ ...x, at: x.at.toISOString() })) as SalesEvent[];
      const clients = await db.query('SELECT * FROM client_lifecycle'),
        tracking = await db.query('SELECT started_at FROM sales_tracking WHERE id=1');
      await db.query('COMMIT');
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
        new Date(),
      );
      return json({
        from,
        to,
        trackingSince: tracking.rows[0].started_at,
        rows: commercialAnalysis(data, events, clients.rows, today, creationDates),
        previous: {
          ...prior,
          rows: commercialAnalysis(
            data,
            previous.rows.map((x) => ({ ...x, at: x.at.toISOString() })),
            clients.rows,
            today,
            creationDates,
          ),
        },
        events: events.slice(-100).reverse(),
        eventCount: events.length,
      });
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  } catch {
    return json({ error: 'No se puede cargar el análisis' }, 503);
  }
}
