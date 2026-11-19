// Integration against a disposable PostgreSQL database, never a user's installation.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';
import { equipmentTemplate } from '../src/domain/custom-modules.ts';
import { nexoBrand } from '../src/domain/workspace.ts';
const database = new URL(process.env.DATABASE_URL || '');
assert.equal(database.pathname, '/nexo_modules_check', 'Refusing a non-fixture database');
const base = process.env.CRM_TEST_URL || 'http://127.0.0.1:8189';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const db = new pg.Client({ connectionString: database.href }),
  password = process.env.CRM_TEST_PASSWORD || randomBytes(24).toString('hex'),
  cookies = new Map();
async function call(path, body, user = 'developer', extra = {}) {
  const jar = cookies.get(user) || new Map();
  cookies.set(user, jar);
  const r = await fetch(base + path, {
    method: body ? (path === '/api/data' ? 'PUT' : 'POST') : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      'x-crm-workspace': jar.get('nexo_workspace') || 'nexo',
      cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of r.headers.getSetCookie()) {
    const first = c.split(';')[0],
      i = first.indexOf('=');
    jar.set(first.slice(0, i), first.slice(i + 1));
  }
  return { status: r.status, body: await r.json() };
}
function ok(r, status = 200) {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
}
const endpoint = '/api/custom-modules';
try {
  ok(await call('/api/auth'));
  await db.connect();
  assert.equal(Number((await db.query('SELECT count(*) FROM app_users')).rows[0].count), 0);
  for (const [username, role] of [
    ['developer', 'developer'],
    ['sales', 'commercial'],
    ['admin', 'admin'],
    ['worker', 'worker'],
  ]) {
    const id = randomUUID(),
      salt = randomBytes(16).toString('hex');
    await db.query(
      'INSERT INTO app_users(id,username,password_hash,role,profile,must_change) VALUES($1,$2,$3,$4,$2,false)',
      [id, username, salt + ':' + scryptSync(password, salt, 64).toString('hex'), role],
    );
    await db.query(
      "INSERT INTO crm_memberships(workspace_id,user_id,role,profile) VALUES('nexo',$1,$2,$3)",
      [id, role, username],
    );
    ok(await call('/api/auth', { action: 'login', username, password }, username));
  }
  ok(await call(endpoint, undefined, 'anonymous'), 401);
  const m = equipmentTemplate();
  ok(await call(endpoint, { action: 'definition', definition: m, version: 0 }, 'admin'), 403);
  ok(
    await call(endpoint, { action: 'definition', definition: m, version: 0 }, 'developer', {
      Origin: 'https://evil.example',
    }),
    403,
  );
  ok(await call(endpoint, { action: 'definition', definition: m, version: 0 }));
  ok(await call(endpoint, { action: 'definition', definition: m, version: 0 }), 409);
  assert.equal(ok(await call(endpoint, undefined, 'worker')).modules.length, 0);
  ok(await call(endpoint + '?module=equipos', undefined, 'worker'), 403);
  const command = {
    action: 'record',
    moduleId: 'equipos',
    moduleVersion: 1,
    title: 'Demo',
    values: { serie: 'TEST-1', estado: 'Pendiente' },
  };
  ok(await call(endpoint, command, 'worker'), 403);
  ok(await call(endpoint, { ...command, values: {} }, 'sales'), 422);
  ok(
    await call(
      endpoint,
      { ...command, values: { ...command.values, cliente: 'unauthorized-id' } },
      'sales',
    ),
    422,
  );
  ok(await call(endpoint, command, 'sales'));
  let record = ok(await call(endpoint + '?module=equipos')).records[0];
  assert.equal(record.title, 'Demo');
  ok(
    await call(
      endpoint,
      { ...command, id: record.id, version: record.version, title: 'Updated' },
      'sales',
    ),
  );
  ok(
    await call(
      endpoint,
      { ...command, id: record.id, version: record.version, title: 'Stale' },
      'sales',
    ),
    409,
  );
  const without = structuredClone(m);
  without.fields = without.fields.filter((f) => f.id !== 'serie');
  ok(await call(endpoint, { action: 'definition', definition: without, version: 1 }), 422);
  const archived = structuredClone(m);
  archived.fields[0].archived = true;
  ok(await call(endpoint, { action: 'definition', definition: archived, version: 1 }));
  record = ok(await call(endpoint + '?module=equipos')).records[0];
  ok(
    await call(endpoint, {
      ...command,
      moduleVersion: 2,
      id: record.id,
      version: record.version,
      values: { ...record.values, serie: 'changed' },
    }),
    422,
  );
  ok(
    await call(
      endpoint,
      {
        action: 'delete',
        moduleId: m.id,
        moduleVersion: 2,
        id: record.id,
        version: record.version,
      },
      'sales',
    ),
    403,
  );
  ok(
    await call(endpoint, {
      action: 'delete',
      moduleId: m.id,
      moduleVersion: 2,
      id: record.id,
      version: record.version,
    }),
  );
  assert.equal(ok(await call(endpoint + '?module=equipos')).records.length, 0);
  assert.equal(
    Number(
      (await db.query('SELECT count(*) FROM crm_custom_records WHERE deleted_at IS NOT NULL'))
        .rows[0].count,
    ),
    1,
  );
  const disabled = { ...archived, enabled: false };
  ok(await call(endpoint, { action: 'definition', definition: disabled, version: 2 }));
  ok(await call(endpoint + '?module=equipos'), 403);
  ok(await call(endpoint, { ...command, moduleVersion: 3 }), 403);
  ok(await call(endpoint, { action: 'definition', definition: archived, version: 3 }));
  const state = ok(await call('/api/data'));
  state.data.companies.push({
    id: 'private-company',
    name: 'Private company',
    sector: '',
    city: '',
    owner: 'developer',
    email: '',
    phone: '',
  });
  ok(await call('/api/data', { version: state.version, data: state.data }));
  ok(
    await call(endpoint, {
      ...command,
      moduleVersion: 4,
      values: { estado: 'Pendiente', cliente: 'private-company' },
    }),
  );
  assert.equal(ok(await call(endpoint + '?module=equipos', undefined, 'sales')).records.length, 0);
  const created = ok(
    await call('/api/workspaces', {
      action: 'create',
      brand: { ...nexoBrand, name: 'Isolation fixture' },
    }),
    201,
  );
  const spaces = ok(await call('/api/workspaces')).spaces;
  const other = spaces.find((w) => w.id !== 'nexo');
  assert.ok(other);
  ok(await call('/api/workspaces', { action: 'switch', id: other.id }));
  assert.equal(ok(await call(endpoint)).modules.length, 0);
  ok(await call(endpoint + '?module=equipos'), 403);
  ok(
    await call(endpoint, undefined, 'worker', {
      'x-crm-workspace': other.id,
      cookie:
        (cookies.get('worker').get('nexo_session')
          ? 'nexo_session=' + cookies.get('worker').get('nexo_session') + '; '
          : '') +
        'nexo_workspace=' +
        other.id,
    }),
    401,
  );
  console.log(
    'Custom modules integration OK: permissions, CSRF, validation, conflicts, archival, deletion, relations, tenant isolation.',
  );
} finally {
  await db.end();
}
