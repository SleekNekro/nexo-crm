import { cookies, headers } from 'next/headers';
import { initWorkspaces, workspaceForUser, workspaceCookie } from '../workspace-store';
import { createHash, randomBytes } from 'node:crypto';
import type { Identity } from '../../application/access';
import { systemPool as pool } from '../system-db';
export const cookieName = 'nexo_session';
export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
let schema: Promise<unknown> | undefined;
export async function initAuth() {
  if (!schema)
    schema = pool
      .query(
        `CREATE TABLE IF NOT EXISTS app_users(id text PRIMARY KEY,username text UNIQUE NOT NULL,password_hash text NOT NULL,role text NOT NULL CHECK(role IN ('admin','commercial','worker')),profile text NOT NULL,active boolean NOT NULL DEFAULT true,must_change boolean NOT NULL DEFAULT true);CREATE TABLE IF NOT EXISTS app_sessions(token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);CREATE TABLE IF NOT EXISTS auth_attempts(username text PRIMARY KEY,attempts integer NOT NULL,window_start timestamptz NOT NULL);
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK(role IN ('developer','admin','commercial','worker'));
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS external boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS access_until timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS work_scope text[];
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_pending text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_pending_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS recovery_hashes jsonb NOT NULL DEFAULT '[]';
ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now();`,
      )
      .catch((e) => {
        schema = undefined;
        throw e;
      });
  await schema;
  await initWorkspaces();
}
export function identity(r: Record<string, any>): Identity {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name || r.username,
    role: r.role,
    permissions: r.permissions ?? null,
    profile: r.profile,
    mustChange: r.must_change,
    external: r.external,
    workScope: r.work_scope,
    accessUntil: r.access_until?.toISOString?.() || null,
  };
}
export async function currentUser(touch = true, globalOnly = false) {
  await initAuth();
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const r = await pool.query(
    "SELECT u.* FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.last_seen>now()-interval '120 minutes' AND u.active=true",
    [digest(token)],
  );
  if (r.rowCount && touch)
    await pool.query('UPDATE app_sessions SET last_seen=now() WHERE token_hash=$1', [
      digest(token),
    ]);
  if (!r.rowCount) return null;
  const account = r.rows[0];
  if (globalOnly) return { ...identity(account), platformDeveloper: account.role === 'developer' };
  const w = await workspaceForUser(account.id, account.role === 'developer');
  const expected = (await headers()).get('x-crm-workspace');
  if (!w || (expected && expected !== w.id)) return null;
  return {
    ...identity({
      ...account,
      role: account.role === 'developer' ? 'developer' : w.role,
      profile: account.role === 'developer' ? 'Dirección' : w.profile,
      permissions: account.role === 'developer' ? null : w.permissions,
      external: w.external,
      work_scope: w.work_scope,
      access_until: w.access_until,
    }),
    workspaceId: w.id,
    workspace: { id: w.id, brand: w.brand, version: w.version },
    platformDeveloper: account.role === 'developer',
  };
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  return (
    req.headers.get('sec-fetch-site') !== 'cross-site' &&
    !!origin &&
    new URL(origin).host === req.headers.get('host')
  );
}
export async function newSession(
  id: string,
  expectedHash: string,
  expectedFactor: string | null = null,
) {
  const token = randomBytes(32).toString('hex');
  await pool.query('DELETE FROM app_sessions WHERE expires_at<=now()');
  const inserted = await pool.query(
    "INSERT INTO app_sessions(token_hash,user_id,expires_at) SELECT $1,id,now()+interval '12 hours' FROM app_users WHERE id=$2 AND password_hash=$3 AND totp_secret IS NOT DISTINCT FROM $4 AND active=true RETURNING user_id",
    [digest(token), id, expectedHash, expectedFactor],
  );
  if (!inserted.rowCount) throw Error('Credenciales modificadas');
  const spaces = await pool.query(
    `SELECT w.id FROM crm_workspaces w JOIN app_users u ON u.id=$1 LEFT JOIN crm_memberships m ON m.workspace_id=w.id AND m.user_id=u.id WHERE w.ready AND (u.role='developer' OR (m.active AND (m.access_until IS NULL OR m.access_until>now()))) ORDER BY (w.id='nexo') DESC,w.created_at LIMIT 1`,
    [id],
  );
  if (!spaces.rowCount) {
    await pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [digest(token)]);
    throw Error('No tienes espacios activos');
  }
  (await cookies()).set(workspaceCookie, spaces.rows[0].id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 43200,
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 43200,
  });
}
export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [digest(token)]);
  jar.delete(cookieName);
  jar.delete(workspaceCookie);
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function throttle(bucket: string, limit = 5, seconds = 900) {
  await pool.query("DELETE FROM auth_attempts WHERE window_start<now()-interval '1 day'");
  const r = await pool.query(
    "INSERT INTO auth_attempts VALUES($1,1,now()) ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN auth_attempts.window_start<now()-($2 * interval '1 second') THEN 1 ELSE auth_attempts.attempts+1 END,window_start=CASE WHEN auth_attempts.window_start<now()-($2 * interval '1 second') THEN now() ELSE auth_attempts.window_start END RETURNING attempts",
    [bucket, seconds],
  );
  return r.rows[0].attempts <= limit;
}

export function matchesWorkspace(req: Request, user: Identity) {
  return !!user.workspaceId && req.headers.get('x-crm-workspace') === user.workspaceId;
}
