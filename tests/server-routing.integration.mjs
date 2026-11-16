import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = 'http://localhost:8083';
async function call(path, body, cookie = '', origin = base) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: r.status,
    data,
    cookie:
      r.headers
        .getSetCookie()
        .map((x) => x.split(';')[0])
        .join('; ') || cookie,
  };
}
await call('/api/auth');
execFileSync('docker', ['exec', '-i', 'nexo-route-app', 'node', '--input-type=module'], {
  input: `
import pg from 'pg';import {scryptSync,randomBytes} from 'node:crypto';
if(!process.env.DATABASE_URL.endsWith('/routing_test'))throw Error('Solo prueba aislada');
const p=new pg.Client({connectionString:process.env.DATABASE_URL});await p.connect();
const salt=randomBytes(16).toString('hex'), hash=salt+':'+scryptSync('Routing-test-only-2026',salt,64).toString('hex');
for(const role of ['developer','admin','commercial','worker']){
const id='routing.'+role;
await p.query('INSERT INTO app_users(id,username,password_hash,role,profile,must_change) VALUES($1,$1,$2,$3,$1,false) ON CONFLICT(id) DO NOTHING',[id,hash,role]);
await p.query("INSERT INTO crm_memberships(workspace_id,user_id,role,profile) VALUES('nexo',$1,$2,$1) ON CONFLICT DO NOTHING",[id,role]);
}
await p.end();`,
  stdio: ['pipe', 'pipe', 'pipe'],
});
assert.equal((await call('/api/server-settings')).status, 401);
assert.equal((await call('/api/server-health')).status, 404);
assert.equal((await call('/__gateway/settings')).status, 401);
let developer;
for (const role of ['developer', 'admin', 'commercial', 'worker']) {
  const login = await call('/api/auth', {
    action: 'login',
    username: 'routing.' + role,
    password: 'Routing-test-only-2026',
  });
  assert.equal(login.status, 200, role + ' login');
  assert.equal(
    (await call('/api/server-settings', undefined, login.cookie)).status,
    role === 'developer' ? 200 : 403,
  );
  if (role === 'developer') developer = login.cookie;
  else
    assert.equal(
      (
        await call(
          '/api/server-settings',
          { action: 'check', target: 'http://app:3000/' },
          login.cookie,
        )
      ).status,
      403,
    );
}
assert.equal(
  (
    await call(
      '/api/server-settings',
      { action: 'check', target: 'http://app:3000/' },
      developer,
      'https://foreign.invalid',
    )
  ).status,
  403,
);
const ip = execFileSync(
  'docker',
  [
    'inspect',
    '-f',
    '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
    'nexo-route-next',
  ],
  { encoding: 'utf8' },
).trim();
const before = await call('/api/server-settings', undefined, developer);
const check = await call(
  '/api/server-settings',
  { action: 'check', target: 'http://' + ip + ':3000/' },
  developer,
);
assert.equal(check.status, 200, JSON.stringify(check.data));
assert.equal(
  (
    await call(
      '/api/server-settings',
      { action: 'apply', ...check.data, confirm: true, actor: 'forged' },
      developer,
    )
  ).status,
  200,
);
execFileSync('docker', ['stop', 'nexo-route-app'], { stdio: 'pipe' });
try {
  const routed = await call('/api/auth', undefined, developer);
  assert.equal(routed.status, 200);
  assert.equal(routed.data.user.username, 'routing.developer');
  const after = await call('/api/server-settings', undefined, developer);
  assert.equal(after.data.history.at(-1).actor, 'routing.developer');
  assert.equal(after.data.version, before.data.version + 1);
  execFileSync('docker', ['restart', 'nexo-route-gateway'], { stdio: 'pipe' });
  for (let i = 0; i < 20; i++) {
    try {
      if ((await call('/api/server-settings', undefined, developer)).status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.equal(
    (await call('/api/server-settings', undefined, developer)).data.target,
    'http://' + ip + ':3000/',
  );
} finally {
  execFileSync('docker', ['start', 'nexo-route-app'], { stdio: 'pipe' });
}
let rollback;
for (let i = 0; i < 20; i++) {
  rollback = await call(
    '/api/server-settings',
    { action: 'check', target: 'http://app:3000/' },
    developer,
  );
  if (rollback.status === 200) break;
  await new Promise((r) => setTimeout(r, 300));
}
assert.equal(rollback.status, 200);
assert.equal(
  (
    await call(
      '/api/server-settings',
      { action: 'apply', ...rollback.data, confirm: true },
      developer,
    )
  ).status,
  200,
);
console.log(
  'OK: developer-only, roles denied, CSRF, probe, global routing with original backend stopped, persistence, audit actor and rollback.',
);
