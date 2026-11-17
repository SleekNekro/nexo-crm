import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trustedOrigin,
  validInternalToken,
  readJsonObject,
} from '../src/infrastructure/security/request-input.ts';
import { validMailbox } from '../src/domain/mail-settings.ts';
const originRequest = (origin, extra = {}) =>
  new Request('http://crm.example/api/auth', {
    headers: { host: 'crm.example', origin, ...extra },
  });
test('CSRF rechaza orígenes malformados, credenciales y protocolos no web', () => {
  for (const origin of [
    'null',
    'garbage',
    'https://other.example',
    'ftp://crm.example',
    'https://user@crm.example',
    'https://crm.example/path',
    'https://crm.example?x=1',
  ])
    assert.equal(trustedOrigin(originRequest(origin)), false, origin);
  assert.equal(trustedOrigin(originRequest('http://crm.example')), true);
  assert.equal(trustedOrigin(originRequest('https://crm.example'), true), true);
  assert.equal(trustedOrigin(originRequest('http://crm.example'), true), false);
  assert.equal(
    trustedOrigin(originRequest('https://crm.example', { 'sec-fetch-site': 'cross-site' })),
    false,
  );
});
test('Clave interna falla de forma segura con longitudes y Unicode distintos', () => {
  const secret = 'a'.repeat(64);
  assert.equal(validInternalToken(secret, secret), true);
  for (const bad of ['', 'a'.repeat(63), 'á'.repeat(64), 'a'.repeat(513)])
    assert.equal(validInternalToken(bad, secret), false);
  assert.equal(validInternalToken('', undefined), false);
  assert.equal(validInternalToken('short', 'short'), false);
});
function request(body, headers = {}) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}
test('JSON limitado por bytes reales incluso sin Content-Length', async () => {
  assert.deepEqual(await readJsonObject(request('{"name":"Á"}'), 32), { name: 'Á' });
  await assert.rejects(readJsonObject(request('{"x":"' + 'á'.repeat(20) + '"}'), 32), {
    status: 413,
  });
  await assert.rejects(readJsonObject(request('{}', { 'Content-Length': '9999' }), 32), {
    status: 413,
  });
  await assert.rejects(readJsonObject(request('{}', { 'Content-Type': 'text/plain' }), 32), {
    status: 415,
  });
  for (const raw of ['null', '[]', '42', '"text"', '{'])
    await assert.rejects(readJsonObject(request(raw), 32), { status: 400 });
});
test('JSON corta flujos de tamaño excesivo', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(c) {
      c.enqueue(new TextEncoder().encode('x'.repeat(40)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request('http://localhost', {
    method: 'POST',
    body,
    duplex: 'half',
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(readJsonObject(req, 32), { status: 413 });
  assert.equal(cancelled, true);
});
test('SMTP acepta solo un buzón sin grupos, comentarios ni cabeceras inyectadas', () => {
  assert.equal(validMailbox('ventas+crm@example.com'), true);
  for (const v of [
    'a@example.com(other)',
    'Name <a@example.com>',
    'group:a@example.com',
    'a@example.com,b@example.com',
    'a@example.com\r\nBcc:b@example.com',
    'a..b@example.com',
    'a@-example.com',
    'a\0@example.com',
  ])
    assert.equal(validMailbox(v), false, v);
});
