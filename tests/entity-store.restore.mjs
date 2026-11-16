import assert from 'node:assert/strict';
import pg from 'pg';
import { migrateEntities, readEntities } from '../src/infrastructure/entity-store.ts';
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/crm_restore_check';
const db = new pg.Pool({ connectionString: url.toString() });
try {
  const tables = (
    await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  ).rows.map((r) => r.tablename);
  const digest = async (table) =>
    (
      await db.query(
        `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) AS value FROM "${table.replaceAll('"', '""')}" t`,
      )
    ).rows[0].value;
  const before = Object.fromEntries(
    await Promise.all(tables.map(async (t) => [t, await digest(t)])),
  );
  const legacy = (await db.query('SELECT version,data FROM prototype_state WHERE id=1')).rows[0];
  await migrateEntities(db, () => {
    throw Error('No debe inicializar datos de ejemplo');
  });
  assert.deepEqual((await readEntities(db)).rows[0], legacy);
  for (const table of tables)
    assert.equal(await digest(table), before[table], `Cambios no esperados en ${table}`);
  console.log(
    'PASS backup restored and migrated: exact business data; existing authentication, sessions, security and sales tables unchanged',
  );
} finally {
  await db.end();
}
