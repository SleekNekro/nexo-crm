import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGateway, targetUrl } from '../services/gateway/server.mjs';
const publicUrl = 'http://127.0.0.1:8080';
test('server destinations exclude self, credentials, public IPs and metadata endpoints', () => {
  for (const url of ['http://192.168.0.21:3000', 'https://10.0.0.3', 'http://app:3000'])
    assert.ok(targetUrl(url, publicUrl));
  for (const url of [
    publicUrl,
    'http://127.0.0.1',
    'http://169.254.169.254',
    'http://8.8.8.8',
    'http://user:pass@10.0.0.1',
    'file:///tmp/a',
    'http://10.0.0.1/api',
    'http://10.0.0.1/?a=1',
  ])
    assert.throws(() => targetUrl(url, publicUrl));
});
test('control requires credentials and a checked, fresh, single-use version; failed targets leave state intact', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'nexo-gateway-'));
  const secret = 'a'.repeat(64),
    file = join(folder, 'settings.json');
  let down = false;
  const options = {
    secret,
    file,
    deploymentId: 'test',
    publicUrl,
    probeOverride: async () => {
      if (down) throw Error('Destino caído');
    },
  };
  const gateway = await createGateway(options);
  await new Promise((resolve) => gateway.control.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + gateway.control.address().port + '/settings';
  async function call(body, token = 'Bearer ' + secret) {
    const r = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: token },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json() };
  }
  try {
    assert.equal((await call(null, 'wrong')).status, 401);
    assert.equal((await call(null, 'é'.repeat(71))).status, 401);
    assert.equal(
      (await call({ action: 'apply', confirm: true, ticket: 'fake', version: 1 })).status,
      409,
    );
    const a = (await call({ action: 'check', target: 'http://192.168.0.21:3000/' })).body;
    const stale = (await call({ action: 'check', target: 'http://192.168.0.22:3000/' })).body;
    assert.equal((await call({ action: 'apply', ...a, confirm: false })).status, 422);
    const applied = await call({ action: 'apply', ...a, confirm: true, actor: 'developer' });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.version, 2);
    assert.equal(applied.body.history[0].actor, 'developer');
    assert.equal((await call({ action: 'apply', ...stale, confirm: true })).status, 409);
    assert.equal((await call({ action: 'apply', ...a, confirm: true })).status, 409);
    const back = (await call({ action: 'check', target: 'http://app:3000/' })).body;
    down = true;
    assert.equal((await call({ action: 'apply', ...back, confirm: true })).status, 422);
    assert.equal((await call()).body.target, 'http://192.168.0.21:3000/');
    const recovered = await createGateway(options);
    await new Promise((resolve) => recovered.control.listen(0, '127.0.0.1', resolve));
    const r = await fetch('http://127.0.0.1:' + recovered.control.address().port + '/settings', {
      headers: { Authorization: 'Bearer ' + secret },
    });
    assert.equal((await r.json()).version, 2);
    await new Promise((resolve) => recovered.control.close(resolve));
  } finally {
    await new Promise((resolve) => gateway.control.close(resolve));
    await rm(folder, { recursive: true, force: true });
  }
});
