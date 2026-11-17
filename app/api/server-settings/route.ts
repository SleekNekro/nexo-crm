import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import { currentUser, json, sameOrigin } from '../../../src/infrastructure/security/auth';
async function relay(req?: Request) {
  try {
    if (req && !sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser(true, true);
    if (!u) return json({ error: 'Inicia sesión' }, 401);
    if (u.mustChange || !u.platformDeveloper)
      return json({ error: 'Solo el desarrollador puede gestionar el servidor' }, 403);
    const url = process.env.CRM_GATEWAY_URL,
      token = process.env.CRM_GATEWAY_TOKEN;
    if (!url || !token) return json({ error: 'La entrada central no está configurada' }, 503);
    const b = req ? await readJsonObject(req, 16384) : undefined;
    const r = await fetch(url + '/settings', {
      method: req ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: b ? JSON.stringify({ ...b, actor: u.username }) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    return json(await r.json(), r.status);
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    return json({ error: 'No se puede contactar con el control del servidor' }, 503);
  }
}
export async function GET() {
  return relay();
}
export async function POST(req: Request) {
  return relay(req);
}
