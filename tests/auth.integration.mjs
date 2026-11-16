import { createCompanyQuote } from '../src/domain/company-quote.ts';
import { revisionFollowUp } from '../src/domain/quote-workflow.ts';
import { markQuoteSent, completeTask, changeStage } from '../src/domain/actions.ts';
import { finishCommercialActivity, daysFrom } from '../src/domain/commercial-workflow.ts';
import { businessToday } from '../src/domain/commercial-followup.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { issueQuote, acceptQuote, createWorkFromOrder } from '../src/domain/actions.ts';
import { totp } from '../src/infrastructure/security/totp.ts';
import { saveLabor, reviewLabor, removeWorker, archiveWorker } from '../src/domain/labor.ts';
const base = process.env.CRM_TEST_URL || 'http://localhost:8081',
  password = 'Prueba-' + randomBytes(20).toString('hex');
async function call(path, { cookie = '', body, method, origin = base } = {}) {
  const r = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      'X-CRM-Workspace': 'nexo',
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    },
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
        .find((c) => c.startsWith('nexo_session='))
        ?.split(';')[0] || cookie,
    headers: r.headers,
  };
}
const auth = (cookie, body) => call('/api/auth', { cookie, body });
assert.equal((await call('/api/data')).status, 401);
assert.equal((await call('/api/users')).status, 401);
assert.equal((await call('/api/products')).status, 401);
assert.equal((await call('/api/photos/' + 'a'.repeat(64))).status, 401);
const boot = execFileSync(
  'docker',
  ['exec', 'nexo-auth-check', 'node', 'scripts/bootstrap-admin.mjs'],
  { encoding: 'utf8' },
);
const temp = boot.match(/Contraseña temporal: (.+)/)[1];
let a = await auth('', { action: 'login', username: 'alex', password: temp });
assert.equal(a.status, 200);
assert.match(a.headers.get('set-cookie'), /HttpOnly/i);
assert.match(a.headers.get('set-cookie'), /SameSite=strict/i);
assert.equal((await call('/api/data', { cookie: a.cookie })).status, 403);
assert.equal((await call('/api/products', { cookie: a.cookie })).status, 403);
const old = a.cookie;
a = await auth(a.cookie, { action: 'password', currentPassword: temp, password });
assert.equal(a.status, 200);
assert.equal((await call('/api/data', { cookie: old })).status, 401);
const initialCommercialCookie = await create('test.commercial', 'commercial', 'Alex');
let state = (await call('/api/data', { cookie: a.cookie })).data;
assert.equal(state.storage, 'postgres');
state.data.workers = [
  { id: 'wa', name: 'Prueba A', kind: 'Propio', company: '', rate: 23 },
  { id: 'wb', name: 'Prueba B', kind: 'Propio', company: '', rate: 30 },
];
state.data.works = [
  {
    id: 'work',
    companyId: 'c1',
    orderId: '',
    name: 'Obra prueba',
    address: 'Bilbao',
    owner: 'Alex',
    responsible: 'Alex',
    workerIds: ['wa', 'wb'],
    start: '',
    end: '',
    status: 'En curso',
    progress: 0,
    notes: 'Solo gestión',
  },
];
let res = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: state });
assert.equal(res.status, 200, JSON.stringify(res.data));
// Work control persists through the HTTP/server path and timestamps are server-owned.
let control = (await call('/api/data', { cookie: a.cookie })).data;
Object.assign(control.data.works[0], {
  areaM2: 70,
  budgetAmount: 3000,
  plannedDays: 5,
  actualStart: '2026-11-01',
  supervision: [
    {
      id: 'supervision-check',
      date: '2026-11-12',
      person: 'Alex',
      hours: 2,
      rate: 30,
      notes: 'Visita',
    },
  ],
  updatedAt: '2000-01-01T00:00:00Z',
});
const savedControl = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: control });
assert.equal(savedControl.status, 200, JSON.stringify(savedControl.data));
assert.equal(savedControl.data.data.works[0].areaM2, 70);
assert.equal(savedControl.data.data.works[0].supervision[0].rate, 30);
assert.notEqual(savedControl.data.data.works[0].updatedAt, '2000-01-01T00:00:00Z');
const invalidControl = structuredClone(savedControl.data);
invalidControl.data.works[0].supervision[0].hours = 25;
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: invalidControl })).status,
  400,
);
// Durable audit: reasons required, server actor, historical deleted values retained.
let auditState = (await call('/api/data', { cookie: a.cookie })).data;
assert.ok(auditState.data.works[0].ownerUserId);
const noReason = structuredClone(auditState);
noReason.data.works[0].supervision[0].hours = 3;
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: noReason })).status,
  422,
);
noReason.data.works[0].supervision[0].changeReason = 'Corrección de la visita';
const audited = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: noReason });
assert.equal(audited.status, 200, JSON.stringify(audited.data));
const history = await call('/api/work-history?workId=work', { cookie: a.cookie });
assert.equal(history.status, 200);
assert.equal(history.data.events[0].action, 'Corrección');
assert.equal(history.data.events[0].actor_name, 'alex');
assert.equal(history.data.events[0].before_value.hours, 2);
assert.equal(history.data.events[0].after_value.hours, 3);
assert.equal(history.data.events[0].reason, 'Corrección de la visita');
const dynamicCookie = await create('new.sales', 'commercial', undefined);
const assignees = await call('/api/assignees', { cookie: a.cookie });
assert.ok(assignees.data.accounts.some((x) => x.profile === 'new.sales'));
assert.deepEqual((await call('/api/data', { cookie: dynamicCookie })).data.data.works, []);
assert.equal((await call('/api/work-history?workId=work', { cookie: dynamicCookie })).status, 403);
const duplicateProfile = await call('/api/users', {
  cookie: a.cookie,
  body: {
    action: 'create',
    username: 'duplicate.sales',
    role: 'commercial',
    profile: 'Alex',
    password: temp,
  },
});
assert.equal(duplicateProfile.status, 409);
// Business invariants are enforced by the actual HTTP handler, with rollback.
let business = (await call('/api/data', { cookie: a.cookie })).data;
business.data = issueQuote(business.data, 'd1', 'business-revision', '2026-11-11');
let issued = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: business });
assert.equal(issued.status, 200, JSON.stringify(issued.data));
for (const mutate of [
  (d) => d.deals[0].versions[0].lines[0].price++,
  (d) => d.companies.shift(),
  (d) => d.orders.push({ ...d.orders[0], id: 'duplicate-order' }),
]) {
  const invalid = structuredClone(issued.data);
  mutate(invalid.data);
  assert.equal(
    (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: invalid })).status,
    422,
  );
  const unchanged = (await call('/api/data', { cookie: a.cookie })).data;
  assert.equal(unchanged.version, issued.data.version);
  assert.deepEqual(unchanged.data, issued.data.data);
}
async function create(username, role, profile) {
  const r = await call('/api/users', {
    cookie: a.cookie,
    body: { action: 'create', username, role, profile, password: temp },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let s = await auth('', { action: 'login', username, password: temp });
  assert.equal(s.status, 200);
  s = await auth(s.cookie, { action: 'password', currentPassword: temp, password });
  assert.equal(s.status, 200);
  return s.cookie;
}
// Account permission changes: developer-only, role ceiling and immediate session revocation.
const limitedCookie = await create('permission-test', 'admin', 'Dirección');
const listed = await call('/api/users', { cookie: a.cookie });
const limitedId = listed.data.users.find((u) => u.username === 'permission-test').id;
const restriction = {
  action: 'permissions',
  id: limitedId,
  permissions: { views: ['Empresas'], actions: [] },
};
assert.equal((await call('/api/users', { cookie: a.cookie, body: restriction })).status, 403);
execFileSync('docker', [
  'compose',
  'exec',
  '-T',
  'db',
  'psql',
  '-U',
  'crm',
  '-d',
  'crm_auth_check',
  '-c',
  "UPDATE app_users SET role='developer' WHERE username='alex'",
]);
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: { ...restriction, permissions: { views: ['Depuración'], actions: [] } },
    })
  ).status,
  400,
);
assert.equal((await call('/api/users', { cookie: a.cookie, body: restriction })).status, 200);
assert.equal((await call('/api/data', { cookie: limitedCookie })).status, 401);
const limitedSession = await auth('', { action: 'login', username: 'permission-test', password });
assert.equal(limitedSession.status, 200);
assert.equal((await call('/api/users', { cookie: limitedSession.cookie })).status, 403);
assert.equal((await call('/api/analytics', { cookie: limitedSession.cookie })).status, 403);
let restrictedData = (await call('/api/data', { cookie: limitedSession.cookie })).data;
restrictedData.data.companies[0].name = 'Not allowed';
assert.equal(
  (await call('/api/data', { cookie: limitedSession.cookie, method: 'PUT', body: restrictedData }))
    .status,
  403,
);
assert.equal(
  (await call('/api/users', { cookie: a.cookie, body: { ...restriction, permissions: null } }))
    .status,
  200,
);
execFileSync('docker', [
  'compose',
  'exec',
  '-T',
  'db',
  'psql',
  '-U',
  'crm',
  '-d',
  'crm_auth_check',
  '-c',
  "UPDATE app_users SET role='admin' WHERE username='alex'",
]);
const catalogue = await call('/api/products', { cookie: a.cookie });
assert.equal(catalogue.status, 200);
assert.equal(catalogue.data.products.length, 6);
assert.equal(new Set(catalogue.data.products.map((p) => p.code)).size, 6);
assert.equal(catalogue.data.products.filter((p) => !p.active).length, 24);
assert.equal(catalogue.data.products.find((p) => p.code === '01009Xxxx').price, 12);
const wc = await create('test.worker', 'worker', 'operario:wa'),
  bc = await create('test.other', 'worker', 'operario:wb'),
  cc = initialCommercialCookie;
// A person must not acquire a second account, including when the first is disabled.
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: {
        action: 'create',
        username: 'duplicate.worker',
        password: temp,
        role: 'worker',
        profile: 'operario:wa',
      },
    })
  ).status,
  409,
);
assert.equal((await call('/api/work-history?workId=work', { cookie: wc })).status, 403);
assert.equal((await call('/api/products', { cookie: wc })).status, 403);
assert.equal((await call('/api/products', { cookie: cc })).status, 200);
// Medium-priority paths: product concurrency, private favorites, partial saves and lightweight polls.
const product = catalogue.data.products[0];
assert.equal(
  (
    await call('/api/products', {
      cookie: cc,
      method: 'PATCH',
      body: { code: product.code, price: 45, active: true, version: product.version },
    })
  ).status,
  403,
);
const updatedProduct = await call('/api/products', {
  cookie: a.cookie,
  method: 'PATCH',
  body: { code: product.code, price: 45.5, active: true, version: product.version },
});
assert.equal(updatedProduct.status, 200);
assert.equal(updatedProduct.data.product.price, 45.5);
assert.ok(updatedProduct.data.product.updatedAt);
assert.equal(
  (
    await call('/api/products', {
      cookie: a.cookie,
      method: 'PATCH',
      body: { code: product.code, price: 55, active: true, version: product.version },
    })
  ).status,
  409,
);
assert.equal(
  (
    await call('/api/products', {
      cookie: cc,
      method: 'PATCH',
      body: { code: product.code, favorite: true },
    })
  ).status,
  200,
);
assert.equal(
  (await call('/api/products', { cookie: cc })).data.products.find((p) => p.code === product.code)
    .favorite,
  true,
);
assert.equal(
  (await call('/api/products', { cookie: a.cookie })).data.products.find(
    (p) => p.code === product.code,
  ).favorite,
  false,
);
assert.equal(
  (
    await call('/api/products', {
      cookie: wc,
      method: 'PATCH',
      body: { code: product.code, favorite: true },
    })
  ).status,
  403,
);
const deltaBase = (await call('/api/data', { cookie: a.cookie })).data;
const deltaCompany = { ...deltaBase.data.companies[0], city: 'Ciudad por cambio parcial' };
const deltaSaved = await call('/api/data', {
  cookie: a.cookie,
  method: 'PATCH',
  body: {
    version: deltaBase.version,
    changes: [{ collection: 'companies', id: deltaCompany.id, value: deltaCompany }],
  },
});
assert.equal(deltaSaved.status, 200, JSON.stringify(deltaSaved.data));
assert.ok(deltaSaved.data.changes.some((c) => c.id === deltaCompany.id));
assert.equal(deltaSaved.data.data, undefined);
assert.equal(
  (await call('/api/data?since=' + deltaSaved.data.version, { cookie: a.cookie })).data.unchanged,
  true,
);
assert.equal(
  (
    await call('/api/data', {
      cookie: a.cookie,
      method: 'PATCH',
      body: { version: deltaBase.version, changes: [] },
    })
  ).status,
  409,
);
const forbiddenDelta = await call('/api/data', {
  cookie: wc,
  method: 'PATCH',
  body: {
    version: deltaSaved.data.version,
    changes: [{ collection: 'companies', id: deltaCompany.id, value: deltaCompany }],
  },
});
assert.equal(forbiddenDelta.status, 403);
let schedule = (await call('/api/data', { cookie: a.cookie })).data;
const task = { ...schedule.data.tasks[0], time: '09:30', durationMinutes: 45 };
const scheduled = await call('/api/data', {
  cookie: a.cookie,
  method: 'PATCH',
  body: { version: schedule.version, changes: [{ collection: 'tasks', id: task.id, value: task }] },
});
assert.equal(scheduled.status, 200, JSON.stringify(scheduled.data));
assert.equal(
  (
    await call('/api/data', {
      cookie: a.cookie,
      method: 'PATCH',
      body: {
        version: scheduled.data.version,
        changes: [{ collection: 'tasks', id: task.id, value: { ...task, time: '25:00' } }],
      },
    })
  ).status,
  422,
);
const comparison = await call('/api/analytics?from=2026-11-01&to=2026-11-12', { cookie: a.cookie });
assert.equal(comparison.status, 200);
assert.deepEqual(
  [comparison.data.previous.from, comparison.data.previous.to],
  ['2026-10-20', '2026-10-31'],
);
let removable = (await call('/api/data', { cookie: a.cookie })).data;
removable.data.workers.push({
  id: 'remove-me',
  name: 'Eliminar prueba',
  kind: 'Propio',
  company: '',
  rate: null,
});
removable.data.works[0].workerIds.push('remove-me');
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: removable })).status,
  200,
);
const removedSession = await create('test.removable', 'worker', 'operario:remove-me');
removable = (await call('/api/data', { cookie: a.cookie })).data;
removable.data = removeWorker(removable.data, 'remove-me', 'Dirección');
const removal = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: removable });
assert.equal(removal.status, 200, JSON.stringify(removal.data));
assert.equal(
  removal.data.data.workers.some((w) => w.id === 'remove-me'),
  false,
);
assert.equal(removal.data.data.works[0].workerIds.includes('remove-me'), false);
assert.equal((await call('/api/data', { cookie: removedSession })).status, 401);
assert.equal(
  (await call('/api/users', { cookie: a.cookie })).data.users.some(
    (u) => u.username === 'test.removable',
  ),
  false,
);
let v = (await call('/api/data', { cookie: wc })).data;
assert.equal(v.data.companies.length, 0);
assert.equal(v.data.workers[0].rate, null);
assert.equal(v.data.works[0].notes, '');
assert.equal((await call('/api/users', { cookie: wc })).status, 403);
let bad = structuredClone(v);
bad.data.workers[0].rate = 100;
assert.equal((await call('/api/data', { cookie: wc, method: 'PUT', body: bad })).status, 403);
assert.equal(
  (await call('/api/data', { cookie: wc, method: 'PUT', body: v, origin: 'http://evil.example' }))
    .status,
  403,
);
const now = new Date().toISOString();
const draft = {
  id: 'test-report',
  workId: 'work',
  workerId: 'wa',
  date: '2026-11-11',
  hours: 4,
  summary: 'Prueba de permisos',
  incidents: '',
  photos: [
    { id: 'photo', name: 'prueba.jpg', caption: '', src: 'data:image/jpeg;base64,/9j/2Q==' },
  ],
  status: 'Borrador',
  rate: null,
  history: [],
  createdAt: now,
  updatedAt: now,
};
v.data = saveLabor(v.data, draft, 'wa', true, now);
res = await call('/api/data', { cookie: wc, method: 'PUT', body: v });
assert.equal(res.status, 200, JSON.stringify(res.data));
let saved = res.data;
const photo = saved.data.laborReports[0].photos[0].src;
assert.equal((await call(photo, { cookie: wc })).status, 200);
assert.equal((await call(photo, { cookie: bc })).status, 404);
assert.equal((await call(photo)).status, 401);
bad = structuredClone(saved);
bad.data.laborReports[0].status = 'Confirmado';
assert.equal((await call('/api/data', { cookie: wc, method: 'PUT', body: bad })).status, 403);
let manager = (await call('/api/data', { cookie: cc })).data;
manager.data = reviewLabor(manager.data, 'test-report', 'Confirmar', 'Alex', '', now);
res = await call('/api/data', { cookie: cc, method: 'PUT', body: manager });
assert.equal(res.status, 200, JSON.stringify(res.data));
assert.equal(res.data.data.laborReports[0].rate, 23);
assert.equal(res.data.data.works[0].actualStart, res.data.data.laborReports[0].date);
const finishState = structuredClone(res.data);
finishState.data.works[0].status = 'Finalizada';
const finishResult = await call('/api/data', { cookie: cc, method: 'PUT', body: finishState });
assert.equal(finishResult.status, 200, JSON.stringify(finishResult.data));
assert.equal(
  finishResult.data.data.works[0].actualEnd,
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date()),
);
const reopenState = structuredClone(finishResult.data);
reopenState.data.works[0].status = 'En curso';
const reopenResult = await call('/api/data', { cookie: cc, method: 'PUT', body: reopenState });
assert.equal(reopenResult.status, 200, JSON.stringify(reopenResult.data));
assert.equal(reopenResult.data.data.works[0].actualEnd, '');

const protectedWorker = (await call('/api/data', { cookie: a.cookie })).data;
protectedWorker.data.workers = protectedWorker.data.workers.filter((w) => w.id !== 'wa');
protectedWorker.data.works[0].workerIds = ['wb'];
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: protectedWorker })).status,
  422,
);
assert.equal((await call('/api/data', { cookie: wc })).status, 200);
const wAfter = (await call('/api/data', { cookie: wc })).data;
assert.equal(wAfter.data.laborReports[0].rate, null);
assert.equal(wAfter.data.laborReports[0].status, 'Confirmado');
assert.equal((await call('/api/data', { cookie: cc, method: 'PUT', body: manager })).status, 409);
let archiveState = (await call('/api/data', { cookie: a.cookie })).data;
const historicalReport = structuredClone(archiveState.data.laborReports[0]);
archiveState.data = archiveWorker(archiveState.data, 'wa', true, 'Dirección');
let archived = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: archiveState });
assert.equal(archived.status, 200, JSON.stringify(archived.data));
assert.deepEqual(archived.data.data.laborReports[0], historicalReport);
assert.equal((await call('/api/data', { cookie: wc })).status, 401);
const archivedAccount = (await call('/api/users', { cookie: a.cookie })).data.users.find(
  (u) => u.username === 'test.worker',
);
assert.equal(archivedAccount.active, false);
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: { action: 'active', id: archivedAccount.id, active: true },
    })
  ).status,
  400,
);
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: {
        action: 'create',
        username: 'archived.worker',
        role: 'worker',
        profile: 'operario:wa',
        password: temp,
      },
    })
  ).status,
  400,
);
archiveState = archived.data;
archiveState.data = archiveWorker(archiveState.data, 'wa', false, 'Dirección');
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: archiveState })).status,
  200,
);
assert.equal(
  (await call('/api/users', { cookie: a.cookie })).data.users.find(
    (u) => u.id === archivedAccount.id,
  ).active,
  false,
);
let users = (await call('/api/users', { cookie: a.cookie })).data.users;
const workerId = users.find((u) => u.username === 'test.worker').id;
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: { action: 'active', id: workerId, active: false },
    })
  ).status,
  200,
);
assert.equal((await call('/api/data', { cookie: wc })).status, 401);
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: {
        action: 'create',
        username: 'duplicate.inactive.worker',
        password: temp,
        role: 'worker',
        profile: 'operario:wa',
      },
    })
  ).status,
  409,
);

assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: {
        action: 'reset',
        id: users.find((u) => u.username === 'test.other').id,
        password: temp,
      },
    })
  ).status,
  200,
);
assert.equal((await call('/api/data', { cookie: bc })).status, 401);
await auth(cc, { action: 'logout' });
assert.equal((await call('/api/data', { cookie: cc })).status, 401);
for (let i = 0; i < 5; i++)
  assert.equal(
    (await auth('', { action: 'login', username: 'not.a.user', password: 'wrong' })).status,
    401,
  );
assert.equal(
  (await auth('', { action: 'login', username: 'not.a.user', password: 'wrong' })).status,
  429,
);
let temporaryState = (await call('/api/data', { cookie: a.cookie })).data;
temporaryState.data.workers.push({
  id: 'external-worker',
  name: 'Personal externo',
  kind: 'Subcontrata',
  company: 'Subcontrata prueba',
  rate: null,
});
temporaryState.data.works[0].workerIds.push('external-worker');
temporaryState.data.works.push({ ...temporaryState.data.works[0], id: 'other-work' });
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: temporaryState })).status,
  200,
);
const temporaryEnd = '2027-12-31';
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: {
        action: 'create',
        username: 'temporary.user',
        password: temp,
        role: 'worker',
        profile: 'operario:external-worker',
        external: true,
        end: temporaryEnd,
        scope: ['work'],
      },
    })
  ).status,
  201,
);
let external = await auth('', { action: 'login', username: 'temporary.user', password: temp });
external = await auth(external.cookie, { action: 'password', currentPassword: temp, password });
assert.equal(external.status, 200);
const externalData = (await call('/api/data', { cookie: external.cookie })).data;
assert.deepEqual(
  externalData.data.works.map((w) => w.id),
  ['work'],
);
const temporaryUsers = (await call('/api/users', { cookie: a.cookie })).data.users;
const temporaryId = temporaryUsers.find((u) => u.username === 'temporary.user').id;
execFileSync('docker', [
  'exec',
  'nexo-auth-check',
  'node',
  '--input-type=module',
  '-e',
  "import pg from 'pg';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query(\"UPDATE crm_memberships SET access_until=now()-interval '1 second' WHERE user_id=(SELECT id FROM app_users WHERE username='temporary.user')\");await c.end();",
]);
assert.equal((await call('/api/data', { cookie: external.cookie })).status, 401);
assert.equal(
  (await auth('', { action: 'login', username: 'temporary.user', password })).status,
  401,
);
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: { action: 'temporary', id: temporaryId, end: temporaryEnd, scope: ['other-work'] },
    })
  ).status,
  200,
);
external = await auth('', { action: 'login', username: 'temporary.user', password });
assert.equal(external.status, 200);
assert.deepEqual(
  (await call('/api/data', { cookie: external.cookie })).data.data.works.map((w) => w.id),
  ['other-work'],
);
await auth(external.cookie, { action: 'logout' });
const firstCookie = a.cookie;
let sec = await call('/api/security', { cookie: a.cookie, body: { action: 'setup', password } });
assert.equal(sec.status, 200, JSON.stringify(sec.data));
const secret = sec.data.secret;
const code = totp(secret, Math.floor(Date.now() / 30000));
sec = await call('/api/security', { cookie: a.cookie, body: { action: 'enable', password, code } });
assert.equal(sec.status, 200, JSON.stringify(sec.data));
const codes = sec.data.codes;
assert.equal(codes.length, 10);
a.cookie = sec.cookie;
assert.equal((await call('/api/data', { cookie: firstCookie })).status, 401);
const challenge = await auth('', { action: 'login', username: 'alex', password });
assert.equal(challenge.data.requiresCode, true);
assert.equal(challenge.cookie, '');
assert.equal((await auth('', { action: 'login', username: 'alex', password, code })).status, 401);
let recovered = await auth('', { action: 'login', username: 'alex', password, code: codes[0] });
assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
assert.equal(
  (await auth('', { action: 'login', username: 'alex', password, code: codes[0] })).status,
  401,
);
assert.equal((await call('/api/security', { cookie: recovered.cookie })).data.remaining, 9);
assert.equal(
  (
    await auth(a.cookie, {
      action: 'password',
      currentPassword: password,
      password: password + 'new',
    })
  ).status,
  400,
);
execFileSync('docker', [
  'exec',
  'nexo-auth-check',
  'node',
  '--input-type=module',
  '-e',
  "import pg from 'pg';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query(\"UPDATE app_sessions SET last_seen=now()-interval '121 minutes'\");await c.end();",
]);
assert.equal((await call('/api/data', { cookie: recovered.cookie })).status, 401);
a = await auth('', { action: 'login', username: 'alex', password, code: codes[1] });
assert.equal(a.status, 200);
let disabled = await call('/api/security', {
  cookie: a.cookie,
  body: { action: 'disable', password, code: codes[2] },
});
assert.equal(disabled.status, 200, JSON.stringify(disabled.data));
assert.equal((await call('/api/data', { cookie: a.cookie })).status, 401);
a.cookie = disabled.cookie;
assert.equal((await call('/api/security', { cookie: a.cookie })).data.enabled, false);
assert.equal((await call('/api/analytics', { cookie: a.cookie })).status, 200);
assert.equal((await call('/api/analytics', { cookie: bc })).status, 401);
assert.equal((await call('/api/diagnostics', { cookie: a.cookie })).status, 403);
assert.equal(
  (
    await call('/api/users', {
      cookie: a.cookie,
      body: { action: 'create', username: 'forbidden.dev', role: 'developer', password },
    })
  ).status,
  403,
);
let live = (await call('/api/data', { cookie: a.cookie })).data;
live.data.companies.push({
  id: 'new-prospect',
  name: 'Nuevo posible',
  owner: 'Alex',
  sector: '',
  city: '',
  email: '',
  phone: '',
});
live.data.deals.push({
  id: 'new-deal',
  companyId: 'new-prospect',
  title: 'Nuevo trato',
  owner: 'Alex',
  stage: 'En preparación',
  lines: [{ description: 'Partida', qty: 1, price: 500, discount: 0, tax: 21 }],
  versions: [],
});
let updated = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: live });
assert.equal(updated.status, 200);
live = updated.data;
live.data.deals.find((d) => d.id === 'new-deal').stage = 'Ganado';
updated = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: live });
assert.equal(updated.status, 200);
assert.equal(updated.data.data.orders.filter((o) => o.dealId === 'new-deal').length, 1);
assert.equal(
  updated.data.data.tasks.filter((t) => t.dealId === 'new-deal' && t.kind === 'Recepción').length,
  1,
);
let metrics = await call('/api/analytics?from=2000-01-01&to=2099-01-01', { cookie: a.cookie });
assert.equal(metrics.status, 200);
let alex = metrics.data.rows.find((r) => r.owner === 'Alex');
assert.equal(alex.newProspects, 1);
assert.equal(alex.activated, 1);
assert.equal(alex.won, 1);
assert.equal(alex.wonValue, 500);
execFileSync('docker', [
  'exec',
  'nexo-auth-check',
  'node',
  '--input-type=module',
  '-e',
  "import pg from 'pg';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query(\"UPDATE app_users SET role='developer' WHERE username='alex'\");await c.end();",
]);
assert.equal((await call('/api/diagnostics', { cookie: a.cookie })).status, 200);
let acceptedState = (await call('/api/data', { cookie: a.cookie })).data;
acceptedState.data.companies.find(
  (c) => c.id === acceptedState.data.deals.find((d) => d.id === 'd2').companyId,
).status = 'Posible cliente';
acceptedState.data = issueQuote(acceptedState.data, 'd2', 'accepted-http', '2026-11-11');
let issuedHttp = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: acceptedState });
assert.equal(issuedHttp.status, 200, JSON.stringify(issuedHttp.data));
acceptedState = issuedHttp.data;
acceptedState.data.deals.find((d) => d.id === 'd2').lines[0].price = 999;
let n = 0;
acceptedState.data = acceptQuote(
  acceptedState.data,
  'd2',
  'accepted-http',
  '2026-11-11',
  () => 'accepted-http-' + ++n,
);
const worksBefore = acceptedState.data.works.length;
const acceptedHttp = await call('/api/data', {
  cookie: a.cookie,
  method: 'PUT',
  body: acceptedState,
});
assert.equal(acceptedHttp.status, 200, JSON.stringify(acceptedHttp.data));
assert.equal(acceptedHttp.data.data.works.length, worksBefore);
const acceptedOrder = acceptedHttp.data.data.orders.find((o) => o.dealId === 'd2');
assert.equal(acceptedOrder.lines[0].price, 54);
assert.equal(acceptedOrder.revisionId, 'accepted-http');
assert.equal(
  acceptedHttp.data.data.companies.find(
    (c) => c.id === acceptedHttp.data.data.deals.find((d) => d.id === 'd2').companyId,
  ).status,
  'Cliente activo',
);
let workRequest = acceptedHttp.data;
workRequest.data = createWorkFromOrder(
  workRequest.data,
  acceptedOrder.id,
  'Dirección',
  () => 'order-work-' + ++n,
);
const createdWork = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: workRequest });
assert.equal(createdWork.status, 200, JSON.stringify(createdWork.data));
const linked = createdWork.data.data.works.find((w) => w.orderId === acceptedOrder.id);
assert.ok(linked);
assert.equal(createdWork.data.data.workItems.find((i) => i.workId === linked.id).plannedQty, 120);
let duplicateWork = structuredClone(createdWork.data);
duplicateWork.data.works.push({ ...linked, id: 'duplicate-order-work' });
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: duplicateWork })).status,
  422,
);
// Activity priorities persist; invalid values are rejected and automatic mode is recoverable.
let priorityState = (await call('/api/data', { cookie: a.cookie })).data;
const priorityTask = priorityState.data.tasks.find((t) => t.kind !== 'Recepción');
priorityTask.kind = 'Presupuesto';
priorityTask.priority = 'Alta';
let prioritySaved = await call('/api/data', {
  cookie: a.cookie,
  method: 'PUT',
  body: priorityState,
});
assert.equal(prioritySaved.status, 200, JSON.stringify(prioritySaved.data));
let priorityReload = (await call('/api/data', { cookie: a.cookie })).data;
assert.equal(priorityReload.data.tasks.find((t) => t.id === priorityTask.id).priority, 'Alta');
let priorityInvalid = structuredClone(priorityReload);
priorityInvalid.data.tasks.find((t) => t.id === priorityTask.id).priority = 'Inventada';
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: priorityInvalid })).status,
  422,
);
delete priorityReload.data.tasks.find((t) => t.id === priorityTask.id).priority;
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: priorityReload })).status,
  200,
);
// Company labels persist without manufacturing a sale or accepting a quote.
let labelState = (await call('/api/data', { cookie: a.cookie })).data;
let invalidLabel = structuredClone(labelState);
invalidLabel.data.companies[0].status = 'Inventado';
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: invalidLabel })).status,
  422,
);
labelState.data.companies[0].status = 'Cliente inactivo';
const labeled = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: labelState });
assert.equal(labeled.status, 200, JSON.stringify(labeled.data));
const labelReload = (await call('/api/data', { cookie: a.cookie })).data;
assert.equal(labelReload.data.companies[0].status, 'Cliente inactivo');
assert.deepEqual(labelReload.data.deals, labelState.data.deals);
assert.deepEqual(labelReload.data.orders, labelState.data.orders);
// Company deletion is atomic and respects the global state, not only the filtered UI.
let deleteState = (await call('/api/data', { cookie: a.cookie })).data;
deleteState.data.companies.push({
  ...deleteState.data.companies[0],
  id: 'delete-company-test',
  name: 'Empresa temporal de prueba',
});
deleteState.data.contacts.push({
  ...deleteState.data.contacts[0],
  id: 'delete-contact-test',
  companyId: 'delete-company-test',
});
let createdCompany = await call('/api/data', {
  cookie: a.cookie,
  method: 'PUT',
  body: deleteState,
});
assert.equal(createdCompany.status, 200, JSON.stringify(createdCompany.data));
let toDelete = structuredClone(createdCompany.data);
toDelete.data.companies = toDelete.data.companies.filter((c) => c.id !== 'delete-company-test');
let orphanAttempt = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: toDelete });
assert.equal(orphanAttempt.status, 422, JSON.stringify(orphanAttempt.data));
toDelete.data.contacts = toDelete.data.contacts.filter(
  (c) => c.companyId !== 'delete-company-test',
);
let companyDeleted = await call('/api/data', { cookie: a.cookie, method: 'PUT', body: toDelete });
assert.equal(companyDeleted.status, 200, JSON.stringify(companyDeleted.data));
const afterCompanyDelete = (await call('/api/data', { cookie: a.cookie })).data;
assert.ok(!afterCompanyDelete.data.companies.some((c) => c.id === 'delete-company-test'));
assert.ok(!afterCompanyDelete.data.contacts.some((c) => c.id === 'delete-contact-test'));
assert.deepEqual(afterCompanyDelete.data.deals, createdCompany.data.data.deals);
// Activity result and the next follow-up must persist in the same server save.
let completionState = (await call('/api/data', { cookie: a.cookie })).data;
const completionDeal = completionState.data.deals.find(
  (d) => !['Ganado', 'Perdido'].includes(d.stage),
);
completionState.data.tasks.push({
  id: 'completion-flow-test',
  dealId: completionDeal.id,
  owner: completionDeal.owner,
  title: 'Llamada de prueba',
  due: businessToday(),
  kind: 'Llamada',
  done: false,
});
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: completionState })).status,
  200,
);
completionState = (await call('/api/data', { cookie: a.cookie })).data;
completionState.data = finishCommercialActivity(
  completionState.data,
  'completion-flow-test',
  'Solicita una muestra',
  { id: 'completion-next-test', title: 'Enviar muestra', due: daysFrom(businessToday(), 3) },
);
const completionSaved = await call('/api/data', {
  cookie: a.cookie,
  method: 'PUT',
  body: completionState,
});
assert.equal(completionSaved.status, 200, JSON.stringify(completionSaved.data));
let completionReload = (await call('/api/data', { cookie: a.cookie })).data;
assert.equal(
  completionReload.data.tasks.find((t) => t.id === 'completion-flow-test').result,
  'Solicita una muestra',
);
assert.equal(completionReload.data.tasks.find((t) => t.id === 'completion-flow-test').done, true);
assert.equal(
  completionReload.data.tasks.find((t) => t.id === 'completion-next-test').kind,
  'Seguimiento',
);
completionReload.data.tasks.find((t) => t.id === 'completion-flow-test').result = 'x'.repeat(4001);
assert.equal(
  (await call('/api/data', { cookie: a.cookie, method: 'PUT', body: completionReload })).status,
  422,
);
console.log('PASS: resultado y siguiente actividad guardados juntos; resultado inválido rechazado');

// End-to-end commercial lifecycle with isolated synthetic records.
{
  let auditCounter = 0;
  const auditId = () => 'audit-flow-' + ++auditCounter;
  let auditState = (await call('/api/data', { cookie: a.cookie })).data;
  const auditCompany = 'audit-company';
  auditState.data.companies.push({
    ...auditState.data.companies[0],
    id: auditCompany,
    name: 'Empresa de auditoría comercial',
    status: 'Posible cliente',
  });
  auditState.data.contacts.push({
    id: 'audit-contact',
    companyId: auditCompany,
    name: 'Contacto de prueba',
    role: 'Compras',
    email: 'audit@example.test',
    phone: '',
  });
  async function auditSave(data) {
    const saved = await call('/api/data', {
      cookie: a.cookie,
      method: 'PUT',
      body: { version: auditState.version, data },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    auditState = (await call('/api/data', { cookie: a.cookie })).data;
    return auditState.data;
  }
  await auditSave(auditState.data);
  await auditSave(createCompanyQuote(auditState.data, auditCompany, 'audit-deal'));
  assert.equal(auditState.data.deals.find((d) => d.id === 'audit-deal').contactId, 'audit-contact');
  auditState.data.deals.find((d) => d.id === 'audit-deal').lines = [
    { description: 'Producto de prueba', qty: 2, price: 100, discount: 10, tax: 21 },
  ];
  await auditSave(auditState.data);
  await auditSave(issueQuote(auditState.data, 'audit-deal', 'audit-r1', businessToday()));
  assert.ok(auditState.data.deals.find((d) => d.id === 'audit-deal').versions[0].snapshot.brand);
  await auditSave(
    markQuoteSent(
      auditState.data,
      'audit-deal',
      'audit-r1',
      new Date().toISOString(),
      daysFrom(businessToday(), 1),
      auditId,
    ),
  );
  assert.equal(
    auditState.data.deals.find((d) => d.id === 'audit-deal').stage,
    'Pendiente del cliente',
  );
  let auditFollow = auditState.data.tasks.find((t) => t.quoteRevisionId === 'audit-r1');
  await auditSave(
    finishCommercialActivity(auditState.data, auditFollow.id, 'Pide ajustar la cantidad', {
      id: 'audit-next',
      title: 'Confirmar propuesta revisada',
      due: daysFrom(businessToday(), 4),
    }),
  );
  assert.equal(
    revisionFollowUp(auditState.data, 'audit-deal', 'audit-r1').due,
    daysFrom(businessToday(), 4),
  );
  auditState.data.deals.find((d) => d.id === 'audit-deal').lines[0].qty = 3;
  await auditSave(issueQuote(auditState.data, 'audit-deal', 'audit-r2', businessToday()));
  await auditSave(
    markQuoteSent(
      auditState.data,
      'audit-deal',
      'audit-r2',
      new Date().toISOString(),
      daysFrom(businessToday(), 2),
      auditId,
    ),
  );
  assert.ok(auditState.data.tasks.find((t) => t.id === 'audit-next').cancelled);
  const worksBeforeAudit = auditState.data.works.length;
  await auditSave(acceptQuote(auditState.data, 'audit-deal', 'audit-r2', businessToday(), auditId));
  assert.equal(
    auditState.data.companies.find((c) => c.id === auditCompany).status,
    'Cliente activo',
  );
  assert.equal(auditState.data.works.length, worksBeforeAudit);
  const auditOrder = auditState.data.orders.find((o) => o.dealId === 'audit-deal');
  assert.equal(auditOrder.lines[0].qty, 3);
  assert.equal(auditOrder.revisionId, 'audit-r2');
  await auditSave(acceptQuote(auditState.data, 'audit-deal', 'audit-r2', businessToday(), auditId));
  assert.equal(auditState.data.orders.filter((o) => o.dealId === 'audit-deal').length, 1);
  const auditReceipt = auditState.data.tasks.find(
    (t) => t.dealId === 'audit-deal' && t.kind === 'Recepción',
  );
  await auditSave(completeTask(auditState.data, auditReceipt.id, true));
  assert.equal(auditState.data.orders.find((o) => o.id === auditOrder.id).status, 'Recibido');
  assert.equal(
    auditState.data.tasks.filter((t) => t.dealId === 'audit-deal' && !t.done && !t.cancelled)
      .length,
    0,
  );
  await auditSave(createCompanyQuote(auditState.data, auditCompany, 'audit-lost'));
  await auditSave(
    changeStage(
      auditState.data,
      'audit-lost',
      'Perdido',
      auditId,
      businessToday(),
      'Cliente pospone la compra',
    ),
  );
  assert.ok(!auditState.data.orders.some((o) => o.dealId === 'audit-lost'));
  assert.equal(
    auditState.data.companies.find((c) => c.id === auditCompany).status,
    'Cliente activo',
  );
  console.log(
    'PASS recorrido completo: empresa, contacto, presupuesto, envío, seguimiento, revisión, aceptación, pedido y entrega; pérdida sin pedido',
  );
}
// Account removal protects owners and self, revokes sessions and preserves business history.
{
  const deletionCookie = await create('delete.account.test', 'commercial', 'delete.account.test');
  const accounts = (await call('/api/users', { cookie: a.cookie })).data.users;
  const target = accounts.find((x) => x.username === 'delete.account.test');
  const developer = accounts.find((x) => x.username === 'alex');
  const owner = accounts.find((x) => x.profile === 'Alex' && x.role === 'commercial');
  assert.equal(
    (
      await call('/api/users', {
        cookie: deletionCookie,
        body: { action: 'remove', id: developer.id },
      })
    ).status,
    403,
  );
  assert.equal(
    (await call('/api/users', { cookie: a.cookie, body: { action: 'remove', id: developer.id } }))
      .status,
    409,
  );
  assert.ok(owner);
  assert.equal(
    (await call('/api/users', { cookie: a.cookie, body: { action: 'remove', id: owner.id } }))
      .status,
    409,
  );
  assert.equal(
    (
      await call('/api/users', {
        cookie: a.cookie,
        body: { action: 'active', id: target.id, active: false },
      })
    ).status,
    200,
  );
  assert.equal((await call('/api/data', { cookie: deletionCookie })).status, 401);
  assert.equal(
    (await auth('', { action: 'login', username: target.username, password })).status,
    401,
  );
  assert.equal(
    (
      await call('/api/users', {
        cookie: a.cookie,
        body: { action: 'active', id: target.id, active: true },
      })
    ).status,
    200,
  );
  const reactivated = await auth('', { action: 'login', username: target.username, password });
  assert.equal(reactivated.status, 200);
  const beforeDeletion = (await call('/api/data', { cookie: a.cookie })).data;
  assert.equal(
    (await call('/api/users', { cookie: a.cookie, body: { action: 'remove', id: target.id } }))
      .status,
    200,
  );
  assert.equal((await call('/api/data', { cookie: reactivated.cookie })).status, 401);
  assert.equal(
    (await auth('', { action: 'login', username: target.username, password })).status,
    401,
  );
  assert.ok(
    !(await call('/api/users', { cookie: a.cookie })).data.users.some((x) => x.id === target.id),
  );
  assert.deepEqual((await call('/api/data', { cookie: a.cookie })).data, beforeDeletion);
  assert.equal(
    (await call('/api/users', { cookie: a.cookie, body: { action: 'remove', id: target.id } }))
      .status,
    404,
  );
  console.log(
    'PASS cuentas: baja, autorización, protección propia y de cartera, revocación e historial intacto',
  );
}
// Removing login access does not remove the person or their confirmed reports.
{
  const before = (await call('/api/data', { cookie: a.cookie })).data;
  assert.ok(before.data.laborReports.some((r) => r.workerId === 'wa'));
  const target = (await call('/api/users', { cookie: a.cookie })).data.users.find(
    (x) => x.username === 'test.worker',
  );
  assert.equal(
    (await call('/api/users', { cookie: a.cookie, body: { action: 'remove', id: target.id } }))
      .status,
    200,
  );
  assert.deepEqual((await call('/api/data', { cookie: a.cookie })).data, before);
  assert.equal(
    (await auth('', { action: 'login', username: target.username, password })).status,
    401,
  );
  console.log('PASS baja de operario: persona, partes y costes conservados');
}
// Developer access bypasses memberships, so disabling it must also block global login.
{
  const session = await create('test.second.developer', 'developer');
  const target = (await call('/api/users', { cookie: a.cookie })).data.users.find(
    (x) => x.username === 'test.second.developer',
  );
  assert.equal(
    (
      await call('/api/users', {
        cookie: a.cookie,
        body: { action: 'active', id: target.id, active: false },
      })
    ).status,
    200,
  );
  assert.equal((await call('/api/data', { cookie: session })).status, 401);
  assert.equal(
    (await auth('', { action: 'login', username: target.username, password })).status,
    401,
  );
  assert.equal(
    (
      await call('/api/users', {
        cookie: a.cookie,
        body: { action: 'active', id: target.id, active: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (await auth('', { action: 'login', username: target.username, password })).status,
    200,
  );
  console.log('PASS cuentas: desactivación y reactivación global del desarrollador');
}
await auth(a.cookie, { action: 'logoutAll' });
assert.equal((await call('/api/data', { cookie: a.cookie })).status, 401);
console.log(
  'PASS: autenticación, permisos, privacidad, concurrencia, revocación, límites, 2FA, anti-reutilización, recuperación e inactividad',
);
