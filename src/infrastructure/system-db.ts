import { Pool } from 'pg';
const g = globalThis as typeof globalThis & { nexoSystemPool?: Pool };
export const systemPool = (g.nexoSystemPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  options:
    '-c search_path=public,pg_catalog -c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000',
}));
