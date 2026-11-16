import { createHmac, timingSafeEqual } from 'node:crypto';
import { systemPool } from '../../../src/infrastructure/system-db';
export async function GET(req: Request) {
  const secret = process.env.CRM_GATEWAY_TOKEN,
    deploymentId = process.env.CRM_DEPLOYMENT_ID;
  const nonce = new URL(req.url).searchParams.get('nonce') || '';
  const supplied = req.headers.get('x-crm-probe') || '';
  const sign = (value: string) => createHmac('sha256', secret!).update(value).digest('hex');
  if (
    !secret ||
    !deploymentId ||
    !/^[a-f0-9]{48}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(sign('request|' + nonce)))
  )
    return new Response(null, { status: 404 });
  try {
    await systemPool.query('SELECT 1');
    const r = await fetch(process.env.CRM_GATEWAY_URL + '/settings', {
      headers: { Authorization: 'Bearer ' + secret },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!r.ok) throw Error('Control no disponible');
    return Response.json(
      {
        ready: true,
        deploymentId,
        proof: sign('response|' + nonce + '|' + deploymentId + '|true'),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ ready: false }, { status: 503 });
  }
}
