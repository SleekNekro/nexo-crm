import { Pool } from 'pg';
const g = globalThis as typeof globalThis & { nexoSystemPool?: Pool };
export const systemPool = (g.nexoSystemPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  options: '-c search_path=public,pg_catalog',
}));
