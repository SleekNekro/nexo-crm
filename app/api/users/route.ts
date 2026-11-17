import { securityEvent } from '../../../src/infrastructure/security/audit';
import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import { accountRemovalReason } from '../../../src/domain/account-removal';
import { randomUUID } from 'node:crypto';
import {
  canAct,
  canView,
  validPermissions,
  canManageAccount,
} from '../../../src/domain/permissions';
import { isAdmin } from '../../../src/domain/roles';
import { validTemporaryAccess } from '../../../src/domain/temporary-access';
import { initData, pool } from '../../../src/infrastructure/db';
import { memberDirectory } from '../../../src/infrastructure/workspace-store';
import { lockEntities } from '../../../src/infrastructure/entity-store';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
import { hashPassword, validPassword } from '../../../src/infrastructure/security/password';
const allowed = (u: NonNullable<Awaited<ReturnType<typeof currentUser>>>) =>
  isAdmin(u.role) && !u.mustChange && canView(u, 'Equipo') && canAct(u, 'accounts');
export async function GET() {
  try {
    const u = await currentUser();
    if (!u) return json({ error: 'Inicia sesión' }, 401);
    if (!allowed(u)) return json({ error: 'Acceso no permitido' }, 403);
    const r = await pool.query(
      `SELECT d.*,(SELECT a.role FROM public.app_users a WHERE a.id=d.id) AS global_role,(access_until AT TIME ZONE 'Europe/Madrid'-interval '1 day')::date AS access_end FROM (${memberDirectory}) d ORDER BY username`,
      [u.workspaceId],
    );
    return json({ users: r.rows });
  } catch {
    return json({ error: 'No se pueden consultar usuarios' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser();
    if (u && !matchesWorkspace(req, u))
      return json({ error: 'Recarga la página: el espacio ha cambiado' }, 409);
    if (!u) return json({ error: 'Inicia sesión' }, 401);
    if (!allowed(u)) return json({ error: 'Acceso no permitido' }, 403);
    const b = await readJsonObject(req, 32 * 1024);
    await initData();
    const c = await pool.connect();
    let committed = false;
    try {
      await c.query('BEGIN');
      const state = (await lockEntities(c, 'UPDATE')).rows[0].data;
      const wid = u.workspaceId;
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
        new Date(),
      );
      const finish = async (status = 200) => {
        await securityEvent(
          { actor: u.id, target: b.id, workspace: wid, event: 'account.' + b.action },
          c,
        );
        await c.query('COMMIT');
        committed = true;
        return json({ ok: true }, status);
      };
      if (b.action !== 'create') {
        if (typeof b.id !== 'string') return json({ error: 'Cuenta no válida' }, 400);
        await c.query('SELECT id FROM public.app_users WHERE id=$1 FOR UPDATE', [b.id]);
        const r = await c.query(
          `SELECT m.*,a.id,a.username,a.active AS global_active,a.role AS global_role FROM public.crm_memberships m JOIN public.app_users a ON a.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 FOR UPDATE OF m`,
          [wid, b.id],
        );
        const target = r.rows[0];
        if (!target) return json({ error: 'Cuenta no encontrada en esta empresa' }, 404);
        if (!canManageAccount(u, target))
          return json(
            { error: 'Esta cuenta requiere gestión del desarrollador: supera tus permisos' },
            403,
          );
        if (
          !target.global_active &&
          !u.platformDeveloper &&
          (b.action === 'temporary' || (b.action === 'active' && b.active === true))
        )
          return json(
            { error: 'Solo Desarrollador puede reactivar una cuenta desactivada globalmente' },
            403,
          );
        if (b.action === 'remove') {
          const reason = accountRemovalReason(state, target, u.id);
          if (reason) return json({ error: reason }, 409);
          await c.query('DELETE FROM public.crm_memberships WHERE workspace_id=$1 AND user_id=$2', [
            wid,
            b.id,
          ]);
          await c.query('DELETE FROM public.app_sessions WHERE user_id=$1', [b.id]);
          await c.query(
            `DELETE FROM public.app_users WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM public.crm_memberships WHERE user_id=$1)`,
            [b.id],
          );
          return await finish();
        }
        if (b.action === 'permissions') {
          if (!u.platformDeveloper)
            return json({ error: 'Solo Desarrollador puede configurar permisos' }, 403);
          if (target.global_role === 'developer')
            return json({ error: 'Desarrollador conserva acceso completo' }, 400);
          if (b.permissions !== null && !validPermissions(b.permissions, target.role))
            return json({ error: 'Permisos no válidos' }, 400);
          await c.query(
            'UPDATE public.crm_memberships SET permissions=$1 WHERE workspace_id=$2 AND user_id=$3',
            [b.permissions, wid, b.id],
          );
          await c.query('DELETE FROM public.app_sessions WHERE user_id=$1', [b.id]);
          return await finish();
        }
        if (b.action === 'temporary') {
          if (
            !target.external ||
            !state.workers?.some((w) => !w.archived && 'operario:' + w.id === target.profile) ||
            !validTemporaryAccess(state, target.profile, b.end, b.scope, today)
          )
            return json({ error: 'Indica operario externo, obras asignadas y fecha vigente' }, 400);
          await c.query(
            `UPDATE public.crm_memberships SET access_until=(($1::date+1)::timestamp AT TIME ZONE 'Europe/Madrid'),work_scope=$2,active=true WHERE workspace_id=$3 AND user_id=$4`,
            [b.end, b.scope, wid, b.id],
          );
          await c.query('UPDATE public.app_users SET active=true WHERE id=$1', [b.id]);
          await c.query('DELETE FROM public.app_sessions WHERE user_id=$1', [b.id]);
          return await finish();
        }
        if (!['active', 'reset'].includes(b.action))
          return json({ error: 'Acción no válida' }, 400);
        if (b.id === u.id)
          return json(
            { error: 'Gestiona tu contraseña desde Mi cuenta; no puedes desactivar tu acceso' },
            400,
          );
        if (b.action === 'active') {
          if (typeof b.active !== 'boolean') return json({ error: 'Estado no válido' }, 400);
          if (
            b.active &&
            target.role === 'worker' &&
            !state.workers?.some((w) => !w.archived && 'operario:' + w.id === target.profile)
          )
            return json(
              { error: 'Restaura primero a esta persona desde Equipo → Archivados' },
              400,
            );
          await c.query(
            'UPDATE public.crm_memberships SET active=$1 WHERE workspace_id=$2 AND user_id=$3',
            [b.active, wid, b.id],
          );
          if (target.global_role === 'developer')
            await c.query('UPDATE public.app_users SET active=$1 WHERE id=$2', [b.active, b.id]);
          else if (b.active)
            await c.query('UPDATE public.app_users SET active=true WHERE id=$1', [b.id]);
          await c.query('DELETE FROM public.app_sessions WHERE user_id=$1', [b.id]);
        } else {
          if (!validPassword(b.password))
            return json({ error: 'Contraseña: entre 12 y 128 caracteres' }, 400);
          const memberships = await c.query(
            'SELECT count(*)::int AS n FROM public.crm_memberships WHERE user_id=$1',
            [b.id],
          );
          if (memberships.rows[0].n > 1 && !u.platformDeveloper)
            return json(
              {
                error:
                  'Esta cuenta accede a varias empresas. Pide al desarrollador que restablezca su contraseña.',
              },
              403,
            );
          await c.query(
            'UPDATE public.app_users SET password_hash=$1,must_change=true WHERE id=$2',
            [await hashPassword(b.password), b.id],
          );
          await c.query('DELETE FROM public.app_sessions WHERE user_id=$1', [b.id]);
        }
        return await finish();
      }
      if (
        typeof b.username !== 'string' ||
        !validPassword(b.password) ||
        !['developer', 'admin', 'commercial', 'worker'].includes(b.role)
      )
        return json(
          { error: 'Introduce usuario, rol y contraseña de entre 12 y 128 caracteres' },
          400,
        );
      const username = b.username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,50}$/.test(username)) return json({ error: 'Usuario no válido' }, 400);
      if (!canManageAccount(u, { role: b.role }))
        return json(
          { error: 'No puedes crear una cuenta con permisos superiores a los tuyos' },
          403,
        );
      const profile = isAdmin(b.role)
        ? 'Dirección'
        : b.role === 'commercial'
          ? typeof b.profile === 'string' && b.profile.trim()
            ? b.profile.trim()
            : username
          : b.profile;
      await c.query("SELECT pg_advisory_xact_lock(hashtext('commercial-account-create'))");
      if (b.role === 'commercial') {
        if (
          typeof profile !== 'string' ||
          !profile.trim() ||
          profile.length > 150 ||
          profile === 'Dirección' ||
          profile.startsWith('operario:')
        )
          return json({ error: 'Perfil comercial no válido' }, 400);
        const duplicate = await c.query(
          `SELECT 1 FROM (${memberDirectory}) d WHERE role IN ('admin','developer','commercial') AND (CASE WHEN role IN ('admin','developer') THEN username ELSE profile END)=$2`,
          [wid, profile],
        );
        if (duplicate.rowCount)
          return json({ error: 'Este perfil ya pertenece a otra cuenta' }, 409);
      }
      if (
        b.role === 'worker' &&
        (typeof profile !== 'string' ||
          !state.workers?.some((w) => !w.archived && 'operario:' + w.id === profile))
      )
        return json({ error: 'Selecciona un operario existente' }, 400);
      if (b.role === 'worker') {
        const duplicate = await c.query(
          'SELECT 1 FROM public.crm_memberships WHERE workspace_id=$1 AND role=$2 AND profile=$3',
          [wid, 'worker', profile],
        );
        if (duplicate.rowCount)
          return json(
            {
              error: 'Este operario ya tiene una cuenta. Gestiona o reactiva su acceso existente.',
            },
            409,
          );
      }
      const external = b.external === true;
      if (
        external &&
        (b.role !== 'worker' || !validTemporaryAccess(state, profile, b.end, b.scope, today))
      )
        return json(
          { error: 'Selecciona operario externo, obras asignadas y caducidad vigente' },
          400,
        );
      const id = randomUUID();
      b.id = id;
      await c.query(
        'INSERT INTO public.app_users(id,username,password_hash,role,profile,display_name) VALUES($1,$2,$3,$4,$5,$6)',
        [id, username, await hashPassword(b.password), b.role, profile, username],
      );
      await c.query(
        `INSERT INTO public.crm_memberships(workspace_id,user_id,role,profile,external,access_until,work_scope) VALUES($1,$2,$3,$4,$5,CASE WHEN $5 THEN (($6::date+1)::timestamp AT TIME ZONE 'Europe/Madrid') ELSE NULL END,$7)`,
        [wid, id, b.role, profile, external, external ? b.end : null, external ? b.scope : null],
      );
      return await finish(201);
    } finally {
      if (!committed) await c.query('ROLLBACK');
      c.release();
    }
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    if ((e as { code?: string }).code === '23505')
      return json(
        {
          error: 'Ese usuario ya existe. El desarrollador puede asignar su cuenta a esta empresa.',
        },
        409,
      );
    return json({ error: 'No se ha podido guardar la cuenta' }, 503);
  }
}
