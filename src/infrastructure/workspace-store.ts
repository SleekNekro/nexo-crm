import { cookies, headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { systemPool } from './system-db';
import { nexoBrand, type WorkspaceInfo } from '../domain/workspace';
export const workspaceCookie = 'nexo_workspace';
let initialized: Promise<void> | undefined;
export function initWorkspaces() {
  return (initialized ??= (async () => {
    const c = await systemPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(73401922)');
      await c.query(`CREATE TABLE IF NOT EXISTS crm_workspaces(id text PRIMARY KEY,schema_name text UNIQUE NOT NULL,name text NOT NULL,brand jsonb NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),ready boolean NOT NULL DEFAULT true);
 CREATE TABLE IF NOT EXISTS crm_memberships(workspace_id text NOT NULL REFERENCES crm_workspaces(id),user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN ('developer','admin','commercial','worker')),profile text NOT NULL,permissions jsonb,active boolean NOT NULL DEFAULT true,external boolean NOT NULL DEFAULT false,access_until timestamptz,work_scope text[],PRIMARY KEY(workspace_id,user_id));`);
      await c.query('ALTER TABLE crm_workspaces ADD COLUMN IF NOT EXISTS settings jsonb');
      const fresh = await c.query(
        `INSERT INTO crm_workspaces(id,schema_name,name,brand) VALUES('nexo','public','NEXO',$1) ON CONFLICT DO NOTHING RETURNING id`,
        [JSON.stringify(nexoBrand)],
      );
      if (fresh.rowCount)
        await c.query(
          `INSERT INTO crm_memberships(workspace_id,user_id,role,profile,permissions,active,external,access_until,work_scope) SELECT 'nexo',id,role,profile,permissions,active,external,access_until,work_scope FROM app_users ON CONFLICT DO NOTHING`,
        );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  })().catch((e) => {
    initialized = undefined;
    throw e;
  }));
}
export type WorkspaceRecord = WorkspaceInfo & { schema_name: string };
export async function selectedWorkspaceId() {
  return (await cookies()).get(workspaceCookie)?.value || 'nexo';
}
export async function workspaceForUser(userId: string, platformDeveloper: boolean, id?: string) {
  await initWorkspaces();
  const selected = id || (await selectedWorkspaceId());
  const r = await systemPool.query(
    `SELECT w.id,w.schema_name,w.brand,w.version,w.settings,m.role,m.profile,m.permissions,m.active,m.external,m.access_until,m.work_scope FROM crm_workspaces w LEFT JOIN crm_memberships m ON m.workspace_id=w.id AND m.user_id=$1 WHERE w.id=$2 AND w.ready AND ($3 OR (m.active AND (m.access_until IS NULL OR m.access_until>now())))`,
    [userId, selected, platformDeveloper],
  );
  return r.rows[0] || null;
}
export async function requestWorkspace(): Promise<WorkspaceRecord> {
  await initWorkspaces();
  const token = (await cookies()).get('nexo_session')?.value;
  if (!token) throw Error('Inicia sesión');
  const result = await systemPool.query(
    `SELECT u.id,u.role FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen>now()-interval '120 minutes' AND u.active`,
    [createHash('sha256').update(token).digest('hex')],
  );
  const u = result.rows[0];
  if (!u) throw Error('Sesión no válida');
  const w = await workspaceForUser(u.id, u.role === 'developer');
  if (!w) throw Error('Espacio no autorizado');
  const expected = (await headers()).get('x-crm-workspace');
  if (expected && expected !== w.id) throw Error('El espacio ha cambiado. Recarga la página.');
  return w;
}
const pools = new Map<string, Pool>();
export function poolForWorkspace(w: Pick<WorkspaceRecord, 'id' | 'schema_name'>): Pool {
  if (w.schema_name !== 'public' && !/^tenant_[a-f0-9]{32}$/.test(w.schema_name))
    throw Error('Esquema no válido');
  let pool = pools.get(w.id);
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30000,
      options: `-c search_path=${w.schema_name},pg_catalog -c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000`,
    });
    pools.set(w.id, pool);
  }
  return pool;
}
export async function workspacePool() {
  return poolForWorkspace(await requestWorkspace());
}
// A workspace-local directory; never expose account credentials through this projection.
export { memberDirectory } from './member-directory';
