import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import http from 'node:http';
const container = process.env.TEST_CONTAINER || 'nexo-auth-check',
  base = 'http://localhost:8081';
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert(info.Config.Env.some((e) => e.startsWith('DATABASE_URL=') && e.endsWith('/crm_auth_check')));
await fetch(base + '/api/auth');
const prefix = 'fix.' + Date.now(),
  pw = 'Fixture-only-security-2026!';
const sql = `import pg from 'pg';import {scryptSync,randomBytes} from 'node:crypto';if(!process.env.DATABASE_URL.endsWith('/crm_auth_check'))throw Error();const p=new pg.Client({connectionString:process.env.DATABASE_URL});await p.connect();const salt=randomBytes(16).toString('hex'),hash=salt+':'+scryptSync('${pw}',salt,64).toString('hex');for(const [suffix,role,permissions] of [['limited','admin',{views:['Equipo'],actions:['accounts']}],['full','admin',null],['dev','developer',null],['sales','commercial',null]]){const id='${prefix}.'+suffix;await p.query('INSERT INTO public.app_users(id,username,password_hash,role,profile,must_change) VALUES($1,$1,$2,$3,$1,false)',[id,hash,role]);await p.query("INSERT INTO public.crm_memberships(workspace_id,user_id,role,profile,permissions) VALUES('nexo',$1,$2,$1,$3)",[id,role,permissions]);}await p.end();`;
execFileSync('docker', ['exec', '-i', container, 'node', '--input-type=module'], { input: sql });
const jars = {};
async function call(actor, path, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: jars[actor] || '',
      Origin: base,
      'Content-Type': 'application/json',
      'X-CRM-Workspace': 'nexo',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) jars[actor] = cookies.map((x) => x.split(';')[0]).join('; ');
  return { status: r.status, data: await r.json() };
}
for (const actor of ['limited', 'full', 'dev'])
  assert.equal(
    (
      await call(actor, '/api/auth', {
        action: 'login',
        username: prefix + '.' + actor,
        password: pw,
      })
    ).status,
    200,
  );
for (const role of ['admin', 'developer', 'commercial'])
  assert.equal(
    (
      await call('limited', '/api/users', {
        action: 'create',
        username: prefix + '.new.' + role,
        password: pw,
        role,
      })
    ).status,
    403,
  );
for (const action of ['reset', 'active', 'remove', 'permissions', 'temporary']) {
  for (const target of ['full', 'sales', 'dev'])
    assert.equal(
      (
        await call('limited', '/api/users', {
          action,
          id: prefix + '.' + target,
          password: pw + 'new',
          active: false,
          permissions: null,
        })
      ).status,
      403,
      action + target,
    );
}
assert.equal(
  (
    await call('full', '/api/users', {
      action: 'create',
      username: prefix + '.badadmin',
      password: pw,
      role: 'admin',
    })
  ).status,
  403,
);
assert.equal(
  (
    await call('full', '/api/users', {
      action: 'create',
      username: prefix + '.new.sales',
      password: pw,
      role: 'commercial',
    })
  ).status,
  201,
);
assert.equal(
  (
    await call('dev', '/api/users', {
      action: 'create',
      username: prefix + '.new.admin',
      password: pw,
      role: 'admin',
    })
  ).status,
  201,
);
const overflow = await fetch(base + '/api/users', {
  method: 'POST',
  headers: {
    Cookie: jars.dev,
    Origin: base,
    'X-CRM-Workspace': 'nexo',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ pad: 'x'.repeat(33000) }),
});
assert.equal(overflow.status, 413);
const slow = http.request(base + '/api/users', {
  method: 'POST',
  headers: {
    Origin: base,
    Cookie: jars.limited,
    'X-CRM-Workspace': 'nexo',
    'Content-Type': 'application/json',
    'Content-Length': '100',
  },
});
slow.on('error', () => {});
slow.write('{"action":');
try {
  await new Promise((r) => setTimeout(r, 700));
  const probe = `import pg from 'pg';const p=new pg.Client({connectionString:process.env.DATABASE_URL});await p.connect();await p.query('BEGIN');await p.query('SELECT * FROM crm_state_meta FOR UPDATE NOWAIT');await p.query('ROLLBACK');await p.end();`;
  execFileSync('docker', ['exec', '-i', container, 'node', '--input-type=module'], {
    input: probe,
  });
} finally {
  slow.destroy();
}
const events = execFileSync('docker', ['exec', '-i', container, 'node', '--input-type=module'], {
  input: `import pg from 'pg';const p=new pg.Client({connectionString:process.env.DATABASE_URL});await p.connect();console.log((await p.query("SELECT count(*)::int AS n FROM public.security_events WHERE actor_id LIKE '${prefix}%'")).rows[0].n);await p.end();`,
  encoding: 'utf8',
});
assert(Number(events.trim()) >= 5);
console.log(
  'PASS HTTP: escalation/create/reset/active/remove/permissions/temporary denied; legitimate admin/developer creation works; oversize 413; partial body holds no DB lock; durable audit events present.',
);

const hidden = await call('limited', '/api/data');
for (const key of ['companies', 'contacts', 'deals', 'orders', 'tasks', 'works'])
  assert.deepEqual(hidden.data.data[key], []);
assert.equal((await call('limited', '/api/security-events')).status, 403);
assert.equal(
  (await call('limited', '/api/quote-pdf?workspace=nexo&deal=anything&revision=anything')).status,
  403,
);
const state = await call('dev', '/api/data');
const { issueQuote } = await import('../src/domain/actions.ts');
const dealId = prefix + '.pdf',
  revisionId = prefix + '.revision';
state.data.data.deals.push({
  id: dealId,
  companyId: state.data.data.companies[0].id,
  title: 'PDF de comprobación de seguridad',
  owner: 'Dirección',
  stage: 'En preparación',
  lines: [{ description: 'Partida ficticia', qty: 2, price: 10, discount: 0, tax: 21 }],
  versions: [],
});
state.data.data = issueQuote(state.data.data, dealId, revisionId, '2026-11-17');
const saved = await fetch(base + '/api/data', {
  method: 'PUT',
  headers: {
    Cookie: jars.dev,
    Origin: base,
    'X-CRM-Workspace': 'nexo',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(state.data),
});
assert.equal(saved.status, 200, await saved.text());
const pdf = await fetch(
  base + '/api/quote-pdf?workspace=nexo&deal=' + dealId + '&revision=' + revisionId,
  { headers: { Cookie: jars.dev, 'X-CRM-Workspace': 'nexo' } },
);
assert.equal(pdf.status, 200);
assert.equal(pdf.headers.get('content-type'), 'application/pdf');
assert.equal(
  Buffer.from(await pdf.arrayBuffer())
    .subarray(0, 5)
    .toString(),
  '%PDF-',
);
console.log(
  'PASS: hidden modules/PDF/audit restricted; genuine quote PDF rendered by isolated service.',
);

execFileSync('docker', ['exec', '-i', container, 'node', '--input-type=module'], {
  input: `import pg from 'pg';if(!process.env.DATABASE_URL.endsWith('/crm_auth_check'))throw Error();const p=new pg.Client({connectionString:process.env.DATABASE_URL});await p.connect();await p.query("UPDATE public.app_users SET active=false WHERE id=$1",['${prefix}.sales']);await p.end();`,
});
assert.equal(
  (await call('full', '/api/users', { action: 'active', id: prefix + '.sales', active: true }))
    .status,
  403,
);
assert.equal(
  (await call('dev', '/api/users', { action: 'active', id: prefix + '.sales', active: true }))
    .status,
  200,
);
console.log('PASS: only developer may reactivate globally disabled accounts');
