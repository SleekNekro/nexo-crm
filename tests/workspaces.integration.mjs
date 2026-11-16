// Runs only against the disposable crm_auth_check database/container.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { seed } from '../src/domain/model.ts';
import { blankBrand } from '../src/domain/workspace.ts';
import { issueQuote } from '../src/domain/actions.ts';
const base = process.env.CRM_TEST_URL || 'http://localhost:8081';
const password = 'Fixture-' + randomBytes(20).toString('hex');
const fixture = `import pg from 'pg';import {scryptSync,randomBytes} from 'node:crypto';if(!process.env.DATABASE_URL.endsWith('/crm_auth_check'))throw Error('Not a disposable database');const p=new pg.Client({connectionString:process.env.DATABASE_URL});await p.connect();const salt=randomBytes(16).toString('hex');const hash=salt+':'+scryptSync(${JSON.stringify(password)},salt,64).toString('hex');for(const [id,role] of [['multi.dev','developer'],['multi.member','commercial'],['multi.outside','admin']]){await p.query('INSERT INTO app_users(id,username,password_hash,role,profile,must_change) VALUES($1,$1,$2,$3,$1,false)',[id,hash,role]);await p.query("INSERT INTO crm_memberships(workspace_id,user_id,role,profile) VALUES('nexo',$1,$2,$1)",[id,role]);}await p.end();`;
execFileSync('docker', ['exec', '-i', 'nexo-auth-check', 'node', '--input-type=module'], {
  input: fixture,
});
function client() {
  return { jar: new Map(), workspace: 'nexo' };
}
async function call(c, path, body, method, expected = c.workspace) {
  const r = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      cookie: [...c.jar].map(([k, v]) => k + '=' + v).join('; '),
      Origin: base,
      'Content-Type': 'application/json',
      ...(expected === null ? {} : { 'X-CRM-Workspace': expected }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const item of r.headers.getSetCookie()) {
    const kv = item.split(';')[0],
      i = kv.indexOf('=');
    c.jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: r.status, data };
}
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
};
async function login(username) {
  const c = client();
  ok(await call(c, '/api/auth', { action: 'login', username, password }));
  return c;
}
async function sw(c, id) {
  ok(await call(c, '/api/workspaces', { action: 'switch', id }));
  c.workspace = id;
}
const dev = await login('multi.dev'),
  member = await login('multi.member'),
  outsider = await login('multi.outside');
const before = ok(await call(dev, '/api/data'));
const catalogue = ok(await call(dev, '/api/products')).products;
assert.equal(catalogue.length, 6);
const brand = {
  ...blankBrand,
  name: 'Empresa de prueba azul',
  legalName: 'Empresa Azul SL',
  taxId: 'CIF-AZUL',
};
ok(await call(member, '/api/workspaces', { action: 'create', brand }), 403);
const b = ok(await call(dev, '/api/workspaces', { action: 'create', brand }), 201).workspace;
assert.match(b.id, /^[a-f0-9]{32}$/);
ok(await call(outsider, '/api/workspaces', { action: 'switch', id: b.id }), 403);
await sw(dev, b.id);
const empty = ok(await call(dev, '/api/data'));
for (const rows of Object.values(empty.data)) assert.equal(rows.length, 0);
assert.deepEqual(ok(await call(dev, '/api/products')).products, []);
ok(await call(dev, '/api/data', { version: empty.version, changes: [] }, 'PATCH', 'nexo'), 401);
ok(await call(dev, '/api/data', { version: empty.version, changes: [] }, 'PATCH', null), 409);
ok(await call(dev, '/api/workspaces', { action: 'grant', userId: 'multi.member', role: 'admin' }));
await sw(member, b.id);
assert.equal(ok(await call(member, '/api/auth')).user.role, 'admin');
assert.equal(
  ok(await call(member, '/api/users')).users.some((u) => u.id === 'multi.outside'),
  false,
);
ok(await call(member, '/api/users', { action: 'active', id: 'multi.outside', active: false }), 404);
ok(
  await call(member, '/api/users', {
    action: 'reset',
    id: 'multi.dev',
    password: 'Forbidden-password',
  }),
  403,
);
ok(
  await call(member, '/api/workspaces', {
    action: 'grant',
    userId: 'multi.outside',
    role: 'admin',
  }),
  403,
);
const product = ok(
  await call(member, '/api/products', {
    code: catalogue[0].code,
    name: 'Producto azul',
    family: 'Materiales',
    price: 12.5,
  }),
  201,
).product;
ok(await call(member, '/api/products', { code: product.code, favorite: true }, 'PATCH'));
assert.equal(ok(await call(member, '/api/products')).products[0].favorite, true);
let state = ok(await call(dev, '/api/data'));
state.data.companies = [
  { ...seed().companies[0], name: 'Cliente exclusivo azul', owner: 'multi.member' },
];
state.data.deals = [
  {
    ...seed().deals[0],
    contactId: '',
    owner: 'multi.member',
    stage: 'En preparación',
    versions: [],
  },
];
state.data.works = [
  {
    id: 'work',
    companyId: 'c1',
    orderId: '',
    name: 'Obra azul',
    address: '',
    owner: 'multi.member',
    responsible: 'multi.member',
    workerIds: [],
    start: '',
    end: '',
    status: 'En curso',
    progress: 0,
    notes: '',
  },
];
state = ok(await call(dev, '/api/data', state, 'PUT'));
state.data = issueQuote(state.data, 'd1', 'blue-revision', '2026-11-12');
state.data.deals[0].versions[0].snapshot.brand = { ...blankBrand, name: 'Forged brand' };
state = ok(await call(dev, '/api/data', state, 'PUT'));
assert.equal(state.data.deals[0].versions[0].snapshot.brand.name, brand.name);
const revised = { ...brand, name: 'Empresa azul actualizada', primary: '#004488' };
ok(await call(member, '/api/workspaces', { action: 'brand', version: 1, brand: revised }), 403);
ok(await call(dev, '/api/workspaces', { action: 'brand', version: 1, brand: revised }));
ok(await call(dev, '/api/workspaces', { action: 'brand', version: 1, brand }), 409);
ok(
  await call(dev, '/api/workspaces', {
    action: 'brand',
    version: 2,
    brand: { ...brand, logo: 'data:image/svg+xml;base64,AAAA' },
  }),
  400,
);
assert.equal(
  ok(await call(dev, '/api/data')).data.deals[0].versions[0].snapshot.brand.name,
  brand.name,
);
// A valid referenced photo in NEXO must not be visible from another company.
const photo = [...(before.data.laborReports || []), ...(before.data.siteReports || [])]
  .flatMap((r) => r.photos)
  .find((p) => p.src.startsWith('/api/photos/'));
assert.ok(photo, 'Regression fixture contains a persisted photo');
ok(await call(dev, photo.src), 404);
ok(await call(dev, photo.src + '?workspace=nexo'), 403);
await sw(dev, 'nexo');
assert.deepEqual(ok(await call(dev, '/api/data')).data, before.data);
assert.equal(
  ok(await call(dev, '/api/products')).products.find((p) => p.code === product.code).price,
  catalogue[0].price,
);
ok(await call(dev, photo.src));
await sw(member, 'nexo');
assert.equal(ok(await call(member, '/api/auth')).user.role, 'commercial');
ok(
  await call(member, '/api/products', { code: 'FORBIDDEN', name: 'Wrong', family: '', price: 1 }),
  403,
);
// Each request carries its own cookie and scope, including concurrent requests.
const parallelA = { ...dev, jar: new Map(dev.jar) },
  parallelB = { ...dev, jar: new Map(dev.jar), workspace: b.id };
parallelB.jar.set('nexo_workspace', b.id);
await Promise.all(
  Array.from({ length: 16 }, async (_, i) => {
    const c = i % 2 ? parallelB : parallelA;
    const d = ok(await call(c, '/api/data')).data;
    assert.equal(
      d.companies[0].name,
      i % 2 ? 'Cliente exclusivo azul' : before.data.companies[0].name,
    );
  }),
);
// Disabling membership B must preserve the same account's NEXO access.
await sw(dev, b.id);
ok(await call(dev, '/api/users', { action: 'active', id: 'multi.member', active: false }));
const renewed = await login('multi.member');
assert.equal(ok(await call(renewed, '/api/auth')).user.workspaceId, 'nexo');
ok(await call(renewed, '/api/workspaces', { action: 'switch', id: b.id }), 403);
console.log(
  'PASS multiempresa: datos, roles, catálogo, favoritos, fotos, revisiones, marcas, pestañas antiguas, concurrencia y baja independiente',
);

// Removing a membership must not delete a shared login or its access to another company.
ok(await call(dev, '/api/workspaces', { action: 'grant', userId: 'multi.outside', role: 'admin' }));
ok(await call(dev, '/api/users', { action: 'remove', id: 'multi.outside' }));
const remainingAccess = await login('multi.outside');
assert.equal(ok(await call(remainingAccess, '/api/auth')).user.workspaceId, 'nexo');
ok(await call(remainingAccess, '/api/workspaces', { action: 'switch', id: b.id }), 403);
console.log('PASS baja multiempresa: conserva el usuario y su acceso a NEXO');
