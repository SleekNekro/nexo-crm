// Run inside the application image: node --experimental-strip-types scripts/migrate-data.mjs
import pg from 'pg';
import { seed } from '../src/domain/model.ts';
import { migrateEntities, readEntities, entityTables } from '../src/infrastructure/entity-store.ts';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrateEntities(pool, seed);
  const state = (await readEntities(pool)).rows[0];
  console.log(
    JSON.stringify({
      schema: 'entities-v1',
      version: state.version,
      counts: Object.fromEntries(
        Object.keys(entityTables).map((key) => [key, (state.data[key] || []).length]),
      ),
    }),
  );
} finally {
  await pool.end();
}
