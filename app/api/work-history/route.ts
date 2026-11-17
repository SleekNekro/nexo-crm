import { currentUser, json } from '../../../src/infrastructure/security/auth';
import { initData, pool } from '../../../src/infrastructure/db';
import { readEntities } from '../../../src/infrastructure/entity-store';
import { visibleData } from '../../../src/application/access';
import { canView, canReadQuotes } from '../../../src/domain/permissions';
export async function GET(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (
      user.mustChange ||
      user.role === 'worker' ||
      !canView(user, 'Obras') ||
      !canReadQuotes(user)
    )
      return json({ error: 'Acceso no permitido' }, 403);
    await initData();
    const workId = new URL(req.url).searchParams.get('workId');
    const state = (await readEntities(pool)).rows[0].data;
    if (!visibleData(state, user).works?.some((w) => w.id === workId))
      return json({ error: 'Obra no autorizada' }, 403);
    const before = new URL(req.url).searchParams.get('before');
    if (before && !/^\d+$/.test(before)) return json({ error: 'Página no válida' }, 400);
    const r = await pool.query(
      'SELECT * FROM crm_work_audit WHERE work_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY id DESC LIMIT 51',
      [workId, before],
    );
    return json({ events: r.rows.slice(0, 50), more: r.rows.length > 50 });
  } catch {
    return json({ error: 'No se puede consultar el historial' }, 503);
  }
}
