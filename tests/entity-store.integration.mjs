import assert from 'node:assert/strict';
import pg from 'pg';
import fs from 'node:fs';
import { seed } from '../src/domain/model.ts';
import {
  entityTables,
  migrateEntities,
  readEntities,
  lockEntities,
  writeEntities,
} from '../src/infrastructure/entity-store.ts';
const control = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const name = 'crm_entity_migration_check';
await control.query(`CREATE DATABASE ${name}`);
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/' + name;
const pool = new pg.Pool({ connectionString: url.toString() });
try {
  const source = fs.existsSync('/test/work/migration-source.json')
    ? JSON.parse(fs.readFileSync('/test/work/migration-source.json', 'utf8'))
    : seed();
  await pool.query(
    'CREATE TABLE prototype_state(id integer PRIMARY KEY,version integer,data jsonb)',
  );
  await pool.query('INSERT INTO prototype_state VALUES(1,37,$1)', [JSON.stringify(source)]);
  await Promise.all([migrateEntities(pool, seed), migrateEntities(pool, seed)]);
  let state = (await readEntities(pool)).rows[0];
  assert.deepEqual(state, { version: 37, data: source });
  for (const [key, table] of Object.entries(entityTables))
    assert.equal(
      Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),
      (source[key] || []).length,
    );
  assert.equal(
    Number((await pool.query('SELECT count(*) FROM crm_quote_revisions')).rows[0].count),
    source.deals.reduce((n, d) => n + d.versions.length, 0),
  );
  assert.equal(
    Number((await pool.query('SELECT count(*) FROM crm_work_assignments')).rows[0].count),
    (source.works || []).reduce((n, w) => n + (w.workerIds || []).length, 0),
  );
  await assert.rejects(
    () => pool.query('UPDATE prototype_state SET version=99'),
    /solo una copia histórica/,
  );
  const beforeXmin = (await pool.query('SELECT id,xmin::text FROM crm_companies')).rows;
  const client = await pool.connect();
  await client.query('BEGIN');
  await lockEntities(client);
  const next = structuredClone(source);
  next.companies[0].name += ' prueba';
  await writeEntities(client, source, next);
  // Other connections see the previous coherent state until commit.
  assert.deepEqual((await readEntities(pool)).rows[0].data, source);
  await client.query('UPDATE crm_state_meta SET version=version+1 WHERE id=1');
  await client.query('COMMIT');
  client.release();
  assert.deepEqual((await readEntities(pool)).rows[0], { version: 38, data: next });
  const afterXmin = (await pool.query('SELECT id,xmin::text FROM crm_companies')).rows;
  for (const r of beforeXmin)
    assert.equal(
      afterXmin.find((x) => x.id === r.id).xmin === r.xmin,
      r.id !== source.companies[0].id,
    );
  const invalid = await pool.connect();
  await invalid.query('BEGIN');
  await lockEntities(invalid);
  await invalid.query(
    "UPDATE crm_contacts SET payload=jsonb_set(payload,'{companyId}','\"missing-parent\"')",
  );
  await assert.rejects(
    () => invalid.query('COMMIT'),
    (e) => e.code === '23503',
  );
  await invalid.query('ROLLBACK');
  invalid.release();
  assert.deepEqual((await readEntities(pool)).rows[0].data, next);
  // A failed bulk write can be rolled back without leaving deleted entities.
  const rollback = await pool.connect();
  await rollback.query('BEGIN');
  await lockEntities(rollback);
  await writeEntities(rollback, next, source);
  await rollback.query('ROLLBACK');
  rollback.release();
  assert.deepEqual((await readEntities(pool)).rows[0].data, next);
  // Legacy snapshot stays unchanged even after live writes.
  assert.deepEqual((await pool.query('SELECT data FROM prototype_state')).rows[0].data, source);
  console.log(
    'PASS migration: exact round-trip, concurrent initialization, entity counts, selective writes, consistent reads, FK rollback, immutable legacy snapshot',
  );
  // Invalid legacy relationships must leave no half-created migration.
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const bad = JSON.parse(JSON.stringify(seed()));
  bad.contacts[0].companyId = 'missing-parent';
  await pool.query(
    'CREATE TABLE prototype_state(id integer PRIMARY KEY,version integer,data jsonb)',
  );
  await pool.query('INSERT INTO prototype_state VALUES(1,1,$1)', [JSON.stringify(bad)]);
  await assert.rejects(() => migrateEntities(pool, seed));
  assert.equal(
    (await pool.query("SELECT to_regclass('crm_state_meta') AS name")).rows[0].name,
    null,
  );
  assert.deepEqual((await pool.query('SELECT data FROM prototype_state')).rows[0].data, bad);
  await pool.query('DROP TABLE prototype_state');
  await migrateEntities(pool, seed);
  assert.deepEqual((await readEntities(pool)).rows[0].data, JSON.parse(JSON.stringify(seed())));
  console.log('PASS migration: failed migration is atomic; fresh installation supported');
} finally {
  await pool.end();
  await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await control.end();
}
