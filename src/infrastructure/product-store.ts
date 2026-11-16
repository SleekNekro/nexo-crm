import type { Pool } from 'pg';
import source from './catalogue/demo-products.json';

/** Import the fictional demo catalogue once per reference, without overwriting later edits. */
export async function initProducts(pool: Pool, importOriginal = true) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(10891089)');
    await client.query(`CREATE TABLE IF NOT EXISTS crm_products (
      code text PRIMARY KEY CHECK(length(code)>0),
      name text NOT NULL,
      family text NOT NULL,
      price numeric(14,2) NOT NULL CHECK(price>=0),
      description text NOT NULL,
      active boolean NOT NULL,
      source text NOT NULL DEFAULT 'Catálogo ficticio de demostración'
    )`);
    await client.query(`ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS updated_at timestamptz;
      ALTER TABLE crm_products ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS crm_product_favorites(user_id text NOT NULL,code text NOT NULL REFERENCES crm_products(code) ON DELETE CASCADE,PRIMARY KEY(user_id,code));`);
    if (importOriginal)
      await client.query(
        `INSERT INTO crm_products(code,name,family,price,description,active)
      SELECT code,name,family,price,description,active FROM jsonb_to_recordset($1::jsonb)
      AS p(code text,name text,family text,price numeric,description text,active boolean)
      ON CONFLICT(code) DO NOTHING`,
        [JSON.stringify(source)],
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
