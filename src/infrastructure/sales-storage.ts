import type { Pool, PoolClient } from 'pg';
import type { Data } from '../domain/model';
import { salesChanges } from '../domain/sales-metrics';
export const salesSchema = `CREATE TABLE IF NOT EXISTS sales_tracking(id integer PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS client_lifecycle(company_id text PRIMARY KEY,active boolean NOT NULL DEFAULT false,activated_at timestamptz);CREATE TABLE IF NOT EXISTS sales_events(id bigserial PRIMARY KEY,kind text NOT NULL,entity_id text NOT NULL,company_id text NOT NULL,owner text NOT NULL,label text NOT NULL,from_stage text NOT NULL,to_stage text NOT NULL,amount numeric NOT NULL,actor_id text NOT NULL,at timestamptz NOT NULL DEFAULT now());CREATE INDEX IF NOT EXISTS sales_events_at ON sales_events(at);`;
export async function baselineSales(db: Pool | PoolClient, d: Data) {
  await db.query('INSERT INTO sales_tracking(id) VALUES(1) ON CONFLICT DO NOTHING');
  for (const c of d.companies)
    await db.query(
      'INSERT INTO client_lifecycle(company_id,active) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [c.id, d.deals.some((x) => x.companyId === c.id && x.stage === 'Ganado')],
    );
}
export async function recordSales(db: PoolClient, before: Data, after: Data, actor: string) {
  await baselineSales(db, before);
  const r = await db.query('SELECT company_id FROM client_lifecycle WHERE active=true');
  for (const event of salesChanges(before, after, new Set(r.rows.map((x) => x.company_id)))) {
    await db.query(
      'INSERT INTO sales_events(kind,entity_id,company_id,owner,label,from_stage,to_stage,amount,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        event.kind,
        event.entityId,
        event.companyId,
        event.owner,
        event.label,
        event.fromStage,
        event.toStage,
        event.amount,
        actor,
      ],
    );
    if (event.kind === 'company_created')
      await db.query('INSERT INTO client_lifecycle(company_id) VALUES($1) ON CONFLICT DO NOTHING', [
        event.companyId,
      ]);
    if (event.kind === 'client_activated')
      await db.query(
        'UPDATE client_lifecycle SET active=true,activated_at=now() WHERE company_id=$1',
        [event.companyId],
      );
  }
}
