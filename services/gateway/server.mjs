import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export function targetUrl(value, publicUrl) {
  const u = new URL(value);
  const p = u.hostname.split('.').map(Number);
  const privateIp =
    p.length === 4 &&
    p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31));
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/' ||
    !['http:', 'https:'].includes(u.protocol) ||
    !(privateIp || u.origin === 'http://app:3000') ||
    u.origin === new URL(publicUrl).origin
  )
    throw Error(
      'Usa la raíz de un servidor de la red privada, distinta de la dirección de entrada.',
    );
  return u.href;
}
export const proof = (secret, text) => createHmac('sha256', secret).update(text).digest('hex');
const equal = (a, b) =>
  typeof a === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function createGateway({
  secret,
  deploymentId,
  publicUrl,
  file,
  initial = 'http://app:3000/',
  probeOverride,
}) {
  if (!secret || secret.length < 32 || !deploymentId)
    throw Error('Falta configuración segura de la entrada.');
  let state;
  try {
    state = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    state = { version: 1, target: initial, history: [] };
  }
  state.target = targetUrl(state.target, publicUrl);
  const tickets = new Map();
  const probe =
    probeOverride ||
    (async (target) => {
      const nonce = randomBytes(24).toString('hex');
      const response = await fetch(target + 'api/server-health?nonce=' + nonce, {
        headers: { 'x-crm-probe': proof(secret, 'request|' + nonce) },
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok || response.headers.has('x-crm-entrypoint'))
        throw Error('El destino no es un servidor CRM directo disponible.');
      const body = await response.json();
      if (
        body.deploymentId !== deploymentId ||
        body.ready !== true ||
        !equal(body.proof, proof(secret, 'response|' + nonce + '|' + deploymentId + '|true'))
      )
        throw Error(
          'El destino no pertenece a esta instalación o no tiene base de datos y control preparados.',
        );
    });
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  let queue = Promise.resolve();
  const control = http.createServer((req, res) => {
    if (!equal(req.headers.authorization, 'Bearer ' + secret))
      return send(res, 401, { error: 'No autorizado' });
    if (req.url !== '/settings') return send(res, 404, { error: 'No encontrado' });
    if (req.method === 'GET') return send(res, 200, { ...state, publicUrl });
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8192) req.destroy();
    });
    req.on('end', () => {
      queue = queue
        .then(async () => {
          try {
            const b = JSON.parse(raw);
            if (b.action === 'check') {
              const target = targetUrl(b.target, publicUrl);
              await probe(target);
              const ticket = randomBytes(24).toString('hex');
              for (const [key, t] of tickets) if (t.expires < Date.now()) tickets.delete(key);
              tickets.set(ticket, { target, version: state.version, expires: Date.now() + 300000 });
              return send(res, 200, { ticket, target, version: state.version });
            }
            if (b.action !== 'apply' || b.confirm !== true)
              throw Error('Confirma el cambio antes de aplicarlo.');
            const t = tickets.get(b.ticket);
            tickets.delete(b.ticket);
            if (
              !t ||
              t.expires < Date.now() ||
              t.version !== state.version ||
              b.version !== state.version
            )
              return send(res, 409, {
                error:
                  'La comprobación ha caducado o la configuración ha cambiado. Vuelve a comprobar.',
              });
            await probe(t.target);
            if (t.target === state.target) return send(res, 200, { ...state, publicUrl });
            const next = {
              version: state.version + 1,
              target: t.target,
              history: [
                ...state.history,
                {
                  at: new Date().toISOString(),
                  actor: String(b.actor || '').slice(0, 100),
                  from: state.target,
                  to: t.target,
                },
              ].slice(-50),
            };
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
            await rename(file + '.tmp', file);
            state = next;
            tickets.clear();
            send(res, 200, { ...state, publicUrl });
          } catch (e) {
            send(res, 422, { error: e.message || 'No se pudo cambiar el servidor.' });
          }
        })
        .catch(() => {
          if (!res.headersSent) send(res, 500, { error: 'No se pudo guardar la configuración.' });
        });
    });
  });
  const proxy = http.createServer((req, res) => {
    // Backends on another office machine use this authenticated control path.
    // The browser never receives the control credential.
    if (req.url === '/__gateway/settings') {
      req.url = '/settings';
      control.emit('request', req, res);
      return;
    }
    if (req.headers['x-crm-entrypoint'] === deploymentId) {
      res.writeHead(508);
      return res.end('Destino circular');
    }
    const target = new URL(state.target);
    const headers = { ...req.headers, 'x-crm-entrypoint': deploymentId };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    const upstream = (target.protocol === 'https:' ? https : http).request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers,
      },
      (response) => {
        res.writeHead(response.statusCode || 502, {
          ...response.headers,
          'x-crm-entrypoint': deploymentId,
        });
        response.pipe(res);
      },
    );
    upstream.setTimeout(120000, () => upstream.destroy(Error('Tiempo agotado')));
    upstream.on('error', () => {
      if (res.headersSent) return res.destroy();
      if (req.url.startsWith('/api/'))
        return send(res, 503, {
          error: 'No se puede conectar al servidor. Reintenta en unos instantes.',
        });
      res.writeHead(503, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>Servidor no disponible</title><body style="font:18px system-ui;padding:40px"><h1>No se puede conectar al servidor</h1><p>Comprueba que el servidor esté encendido. Si continúa, avisa al responsable.</p><button onclick="location.reload()">Reintentar</button></body></html>',
      );
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  });
  return { control, proxy };
}
if (process.argv[1]?.endsWith('/server.mjs')) {
  const gateway = await createGateway({
    secret: process.env.CRM_GATEWAY_TOKEN,
    deploymentId: process.env.CRM_DEPLOYMENT_ID,
    publicUrl: process.env.CRM_PUBLIC_URL,
    file: '/data/settings.json',
  });
  gateway.control.listen(8090, '0.0.0.0');
  gateway.proxy.listen(8080, '0.0.0.0');
}
