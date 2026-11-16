import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import type { Data } from '../domain/model';
export const entityTables = {
  companies: 'crm_companies',
  contacts: 'crm_contacts',
  deals: 'crm_deals',
  tasks: 'crm_tasks',
  orders: 'crm_orders',
  notes: 'crm_notes',
  workers: 'crm_workers',
  works: 'crm_works',
  siteReports: 'crm_site_reports',
  laborReports: 'crm_labor_reports',
  workExpenses: 'crm_work_expenses',
  workItems: 'crm_work_items',
  workZones: 'crm_work_zones',
} as const;
type Key = keyof typeof entityTables;
const keys = Object.keys(entityTables) as Key[];
const refs: Partial<Record<Key, Record<string, [string, Key, boolean?]>>> = {
  contacts: { company_id: ['companyId', 'companies'] },
  deals: { company_id: ['companyId', 'companies'], contact_id: ['contactId', 'contacts', true] },
  tasks: { deal_id: ['dealId', 'deals'] },
  orders: { deal_id: ['dealId', 'deals'] },
  notes: { deal_id: ['dealId', 'deals'] },
  works: { company_id: ['companyId', 'companies'], order_id: ['orderId', 'orders', true] },
  siteReports: { work_id: ['workId', 'works'] },
  laborReports: { work_id: ['workId', 'works'], worker_id: ['workerId', 'workers'] },
  workExpenses: { work_id: ['workId', 'works'] },
  workItems: { work_id: ['workId', 'works'] },
  workZones: { item_id: ['itemId', 'workItems'] },
};
const canonical = (v: unknown) => JSON.parse(JSON.stringify(v));
const same = (a: unknown, b: unknown) => isDeepStrictEqual(canonical(a), canonical(b));
export const entitySchema = `
CREATE TABLE crm_state_meta(id integer PRIMARY KEY CHECK(id=1),version integer NOT NULL CHECK(version>0),collections jsonb NOT NULL,schema_version integer NOT NULL DEFAULT 1,migrated_at timestamptz NOT NULL DEFAULT now());
${keys
  .map(
    (k) =>
      `CREATE TABLE ${entityTables[k]}(id text PRIMARY KEY CHECK(length(id)>0),position integer NOT NULL CHECK(position>=0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object') CHECK(payload->>'id'=id)${Object.entries(
        refs[k] || {},
      )
        .map(
          ([col, [field, , optional]]) =>
            `,${col} text GENERATED ALWAYS AS (NULLIF(payload->>'${field}','')) STORED ${optional ? '' : 'NOT NULL'}`,
        )
        .join('')});`,
  )
  .join('\n')}
${keys.flatMap((k) => Object.entries(refs[k] || {}).map(([col, [, parent]]) => `ALTER TABLE ${entityTables[k]} ADD FOREIGN KEY(${col}) REFERENCES ${entityTables[parent]}(id) DEFERRABLE INITIALLY DEFERRED; CREATE INDEX ON ${entityTables[k]}(${col});`)).join('\n')}
CREATE UNIQUE INDEX ON crm_orders(deal_id);
CREATE TABLE crm_quote_revisions(deal_id text NOT NULL REFERENCES crm_deals(id) DEFERRABLE INITIALLY DEFERRED,id text NOT NULL,position integer NOT NULL,payload jsonb NOT NULL CHECK(payload->>'id'=id),PRIMARY KEY(deal_id,id));
CREATE TABLE crm_work_assignments(work_id text NOT NULL REFERENCES crm_works(id) DEFERRABLE INITIALLY DEFERRED,worker_id text NOT NULL REFERENCES crm_workers(id) DEFERRABLE INITIALLY DEFERRED,position integer NOT NULL,PRIMARY KEY(work_id,worker_id));
CREATE INDEX ON crm_work_assignments(worker_id);
`;
function payload(key: Key, row: any) {
  const value = structuredClone(row);
  if (key === 'deals') delete value.versions;
  if (key === 'works') delete value.workerIds;
  return value;
}
// A single statement gives a consistent MVCC snapshot across every entity table.
const projection = keys
  .map(
    (k) =>
      `CASE WHEN m.collections ? '${k}' THEN jsonb_build_object('${k}',COALESCE((SELECT jsonb_agg(${k === 'deals' ? "e.payload || jsonb_build_object('versions',COALESCE((SELECT jsonb_agg(v.payload ORDER BY v.position) FROM crm_quote_revisions v WHERE v.deal_id=e.id),'[]'::jsonb))" : k === 'works' ? "e.payload || CASE WHEN m.collections->'workAssignmentsPresent' ? e.id THEN jsonb_build_object('workerIds',COALESCE((SELECT jsonb_agg(a.worker_id ORDER BY a.position) FROM crm_work_assignments a WHERE a.work_id=e.id),'[]'::jsonb)) ELSE '{}'::jsonb END" : 'e.payload'} ORDER BY e.position) FROM ${entityTables[k]} e),'[]'::jsonb)) ELSE '{}'::jsonb END`,
  )
  .join(' || ');
export function readEntities(db: Pool | PoolClient) {
  return db.query<{ version: number; data: Data }>(
    `SELECT m.version,${projection} AS data FROM crm_state_meta m WHERE id=1`,
  );
}
export async function lockEntities(db: PoolClient, mode: 'UPDATE' | 'SHARE' = 'UPDATE') {
  await db.query(`SELECT id FROM crm_state_meta WHERE id=1 FOR ${mode}`);
  return readEntities(db);
}
function collections(data: Data) {
  return {
    ...Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, true])),
    workAssignmentsPresent: (data.works || [])
      .filter((w) => w.workerIds !== undefined)
      .map((w) => w.id),
  };
}
/** Caller owns a transaction and metadata lock. Only modified records are written. */
export async function writeEntities(db: PoolClient, before: Data, next: Data) {
  for (const key of keys) {
    const old = new Map((before[key] || []).map((r, i) => [r.id, { r, i }]));
    const current = next[key] || [];
    const ids = new Set(current.map((r) => r.id));
    for (const [id] of old)
      if (!ids.has(id)) await db.query(`DELETE FROM ${entityTables[key]} WHERE id=$1`, [id]);
    for (const [position, row] of current.entries()) {
      const previous = old.get(row.id),
        value = payload(key, row);
      if (previous && previous.i === position && same(payload(key, previous.r), value)) continue;
      await db.query(
        `INSERT INTO ${entityTables[key]}(id,position,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET position=EXCLUDED.position,payload=EXCLUDED.payload`,
        [row.id, position, JSON.stringify(value)],
      );
    }
  }
  const revisions = (d: Data) =>
    d.deals.flatMap((deal) =>
      deal.versions.map((v, position) => ({ parent: deal.id, id: v.id, position, value: v })),
    );
  const assignments = (d: Data) =>
    (d.works || []).flatMap((w) =>
      (w.workerIds || []).map((id, position) => ({ parent: w.id, id, position, value: null })),
    );
  for (const spec of [
    {
      table: 'crm_quote_revisions',
      parent: 'deal_id',
      id: 'id',
      rows: revisions,
      hasPayload: true,
    },
    {
      table: 'crm_work_assignments',
      parent: 'work_id',
      id: 'worker_id',
      rows: assignments,
      hasPayload: false,
    },
  ]) {
    const old = new Map(spec.rows(before).map((r) => [JSON.stringify([r.parent, r.id]), r]));
    const rows = spec.rows(next),
      ids = new Set(rows.map((r) => JSON.stringify([r.parent, r.id])));
    for (const [key, r] of old)
      if (!ids.has(key))
        await db.query(`DELETE FROM ${spec.table} WHERE ${spec.parent}=$1 AND ${spec.id}=$2`, [
          r.parent,
          r.id,
        ]);
    for (const r of rows) {
      if (same(old.get(JSON.stringify([r.parent, r.id])) ?? null, r)) continue;
      await db.query(
        `INSERT INTO ${spec.table}(${spec.parent},${spec.id},position${spec.hasPayload ? ',payload' : ''}) VALUES($1,$2,$3${spec.hasPayload ? ',$4' : ''}) ON CONFLICT(${spec.parent},${spec.id}) DO UPDATE SET position=EXCLUDED.position${spec.hasPayload ? ',payload=EXCLUDED.payload' : ''}`,
        [r.parent, r.id, r.position, ...(spec.hasPayload ? [JSON.stringify(r.value)] : [])],
      );
    }
  }
  await db.query('UPDATE crm_state_meta SET collections=$1 WHERE id=1', [
    JSON.stringify(collections(next)),
  ]);
}
export async function migrateEntities(pool: Pool, initial: () => Data) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(73401921)');
    const installed = await db.query(
      "SELECT to_regclass(current_schema() || '.crm_state_meta') AS name",
    );
    if (installed.rows[0].name) {
      const meta = await db.query('SELECT schema_version FROM crm_state_meta WHERE id=1');
      if (meta.rows[0]?.schema_version !== 1) throw Error('Versión de esquema no compatible');
      await db.query('COMMIT');
      return;
    }
    const legacy = await db.query(
      "SELECT to_regclass(current_schema() || '.prototype_state') AS name",
    );
    let source: { version: number; data: Data };
    if (legacy.rows[0].name) {
      await db.query('LOCK TABLE prototype_state IN ACCESS EXCLUSIVE MODE');
      const r = await db.query('SELECT version,data FROM prototype_state WHERE id=1');
      if (r.rowCount !== 1) throw Error('Estado antiguo ausente');
      source = r.rows[0];
    } else source = { version: 1, data: initial() };
    const allowed = new Set(keys);
    for (const key of Object.keys(source.data))
      if (!allowed.has(key as Key)) throw Error('Colección desconocida: ' + key);
    for (const key of keys) {
      const rows = source.data[key] || [];
      if (
        !Array.isArray(rows) ||
        rows.some((r) => typeof r.id !== 'string' || !r.id) ||
        new Set(rows.map((r) => r.id)).size !== rows.length
      )
        throw Error('Identificadores inválidos en ' + key);
    }
    await db.query(entitySchema);
    await db.query('INSERT INTO crm_state_meta(id,version,collections) VALUES(1,$1,$2)', [
      source.version,
      JSON.stringify(collections(source.data)),
    ]);
    await writeEntities(
      db,
      { companies: [], contacts: [], deals: [], tasks: [], orders: [], notes: [] },
      source.data,
    );
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    const restored = (await readEntities(db)).rows[0];
    if (restored.version !== source.version || !same(restored.data, source.data))
      throw Error('La comprobación de migración no coincide');
    if (legacy.rows[0].name)
      await db.query(
        `CREATE FUNCTION crm_legacy_readonly() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Datos migrados: prototype_state es solo una copia histórica'; END $$; CREATE TRIGGER crm_legacy_readonly BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON prototype_state FOR EACH STATEMENT EXECUTE FUNCTION crm_legacy_readonly();`,
      );
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}
