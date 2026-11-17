import { currentUser, json } from '../../../src/infrastructure/security/auth';
import { systemPool } from '../../../src/infrastructure/system-db';
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    if (!u) return json({ error: 'Inicia sesión' }, 401);
    if (!u.platformDeveloper || u.mustChange) return json({ error: 'Solo Desarrollador' }, 403);
    const before = new URL(req.url).searchParams.get('before');
    if (before && !/^\d{1,18}$/.test(before)) return json({ error: 'Página no válida' }, 400);
    const result = await systemPool.query(
      'SELECT * FROM public.security_events WHERE ($1::bigint IS NULL OR id<$1::bigint) ORDER BY id DESC LIMIT 100',
      [before],
    );
    return json({ events: result.rows });
  } catch {
    return json({ error: 'No se puede consultar el registro' }, 503);
  }
}
