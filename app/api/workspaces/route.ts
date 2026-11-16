import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
import { systemPool } from '../../../src/infrastructure/system-db';
import {
  workspaceForUser,
  workspaceCookie,
  poolForWorkspace,
} from '../../../src/infrastructure/workspace-store';
import { initWorkspaceData } from '../../../src/infrastructure/db';
import { readEntities } from '../../../src/infrastructure/entity-store';
import { validBrand } from '../../../src/domain/workspace';
function safeLogo(logo: string) {
  if (!logo.startsWith('data:')) return true;
  const bytes = Buffer.from(logo.split(',')[1] || '', 'base64');
  return logo.startsWith('data:image/png;')
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : logo.startsWith('data:image/jpeg;')
      ? bytes[0] === 255 && bytes[1] === 216
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}
export async function GET() {
  try {
    const u = await currentUser(true, true);
    if (!u) return json({ error: 'Inicia sesión' }, 401);
    if (u.mustChange) return json({ error: 'Cambia tu contraseña' }, 403);
    const spaces = await systemPool.query(
      `SELECT w.id,w.brand,w.version FROM crm_workspaces w LEFT JOIN crm_memberships m ON m.workspace_id=w.id AND m.user_id=$1 WHERE w.ready AND ($2 OR (m.active AND (m.access_until IS NULL OR m.access_until>now()))) ORDER BY w.created_at`,
      [u.id, u.platformDeveloper],
    );
    const accounts = u.platformDeveloper
      ? (
          await systemPool.query(
            'SELECT id,username,COALESCE(display_name,username) AS name FROM app_users WHERE active ORDER BY username',
          )
        ).rows
      : [];
    return json({ spaces: spaces.rows, accounts });
  } catch {
    return json({ error: 'No se pueden cargar las empresas' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const account = await currentUser(true, true);
    if (!account) return json({ error: 'Inicia sesión' }, 401);
    if (account.mustChange) return json({ error: 'Cambia tu contraseña' }, 403);
    const b = await req.json();
    if (b.action === 'switch') {
      if (
        typeof b.id !== 'string' ||
        !(await workspaceForUser(account.id, !!account.platformDeveloper, b.id))
      )
        return json({ error: 'No tienes acceso a esta empresa' }, 403);
      (await cookies()).set(workspaceCookie, b.id, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.COOKIE_SECURE === 'true',
        path: '/',
        maxAge: 43200,
      });
      return json({ ok: true });
    }
    const u = await currentUser();
    if (u && !matchesWorkspace(req, u))
      return json({ error: 'Recarga la página: el espacio ha cambiado' }, 409);
    if (!u) return json({ error: 'El espacio ha cambiado. Recarga la página.' }, 403);
    if (b.action === 'brand') {
      if (!u.platformDeveloper)
        return json(
          { error: 'Solo Desarrollador puede modificar la identidad de las empresas' },
          403,
        );
      if (!validBrand(b.brand) || !safeLogo(b.brand.logo) || !Number.isInteger(b.version))
        return json({ error: 'Revisa nombre, colores, logo y datos de empresa' }, 400);
      const r = await systemPool.query(
        'UPDATE crm_workspaces SET name=$1,brand=$2,version=version+1 WHERE id=$3 AND version=$4 RETURNING id,brand,version',
        [b.brand.name.trim(), b.brand, u.workspaceId, b.version],
      );
      if (!r.rowCount)
        return json({ error: 'La configuración ha cambiado. Recarga antes de guardar.' }, 409);
      return json({ workspace: r.rows[0] });
    }
    if (!account.platformDeveloper)
      return json(
        { error: 'Solo Desarrollador puede crear empresas y asignar accesos entre ellas' },
        403,
      );
    if (b.action === 'create') {
      if (!validBrand(b.brand) || !safeLogo(b.brand.logo))
        return json({ error: 'Configuración de empresa no válida' }, 400);
      const id = randomUUID().replaceAll('-', ''),
        schema = 'tenant_' + id;
      const c = await systemPool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`CREATE SCHEMA "${schema}"`);
        await c.query(
          'INSERT INTO crm_workspaces(id,schema_name,name,brand,ready) VALUES($1,$2,$3,$4,false)',
          [id, schema, b.brand.name.trim(), b.brand],
        );
        await c.query(
          "INSERT INTO crm_memberships(workspace_id,user_id,role,profile) VALUES($1,$2,'developer','Dirección')",
          [id, u.id],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      try {
        await initWorkspaceData({ id, schema_name: schema });
        await systemPool.query('UPDATE crm_workspaces SET ready=true WHERE id=$1', [id]);
      } catch (e) {
        const c = await systemPool.connect();
        try {
          await c.query('BEGIN');
          await c.query('DELETE FROM crm_memberships WHERE workspace_id=$1', [id]);
          await c.query('DELETE FROM crm_workspaces WHERE id=$1 AND ready=false', [id]);
          await c.query(`DROP SCHEMA "${schema}" CASCADE`);
          await c.query('COMMIT');
        } catch {
          await c.query('ROLLBACK');
        } finally {
          c.release();
        }
        throw e;
      }
      return json({ workspace: { id, brand: b.brand, version: 1 } }, 201);
    }
    if (b.action === 'grant') {
      if (typeof b.userId !== 'string' || !['admin', 'commercial', 'worker'].includes(b.role))
        return json({ error: 'Cuenta o rol no válido' }, 400);
      const target = (
        await systemPool.query('SELECT id,username,role FROM app_users WHERE id=$1 AND active', [
          b.userId,
        ])
      ).rows[0];
      if (!target) return json({ error: 'Cuenta no encontrada' }, 404);
      const previous = (
        await systemPool.query(
          'SELECT role,profile FROM crm_memberships WHERE workspace_id=$1 AND user_id=$2',
          [u.workspaceId, b.userId],
        )
      ).rows[0];
      const role = target.role === 'developer' ? 'developer' : b.role;
      const profile = ['admin', 'developer'].includes(role)
        ? 'Dirección'
        : role === 'commercial'
          ? previous?.role === 'commercial'
            ? previous.profile
            : target.username
          : b.profile;
      if (role === 'worker') {
        const w = await workspaceForUser(u.id, true, u.workspaceId);
        const d = (await readEntities(poolForWorkspace(w))).rows[0].data;
        if (
          typeof profile !== 'string' ||
          !d.workers?.some((x) => !x.archived && 'operario:' + x.id === profile)
        )
          return json({ error: 'Selecciona un operario de esta empresa' }, 400);
      }
      const c = await systemPool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT pg_advisory_xact_lock(hashtext('commercial-account-create'))");
        const duplicate = await c.query(
          `SELECT 1 FROM crm_memberships m JOIN app_users a ON a.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id<>$2 AND (CASE WHEN m.role IN ('admin','developer') THEN a.username ELSE m.profile END)=$3`,
          [
            u.workspaceId,
            b.userId,
            ['admin', 'developer'].includes(role) ? target.username : profile,
          ],
        );
        if (duplicate.rowCount) {
          await c.query('ROLLBACK');
          return json({ error: 'Ese perfil ya está asignado' }, 409);
        }
        await c.query(
          `INSERT INTO crm_memberships(workspace_id,user_id,role,profile) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role,profile=EXCLUDED.profile,active=true,permissions=CASE WHEN crm_memberships.role=EXCLUDED.role THEN crm_memberships.permissions ELSE NULL END`,
          [u.workspaceId, b.userId, role, profile],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      return json({ ok: true });
    }
    return json({ error: 'Acción no válida' }, 400);
  } catch {
    return json({ error: 'No se ha podido guardar la configuración de empresa' }, 503);
  }
}
