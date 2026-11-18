// Run against an isolated Nexo server and a disposable database only.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';
const database = new URL(process.env.DATABASE_URL || '');
assert.equal(database.pathname, '/nexo_commercial_check', 'Refusing a non-fixture database');
const base = process.env.CRM_TEST_URL || 'http://127.0.0.1:8187';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const password = randomBytes(24).toString('hex');
const db = new pg.Client({ connectionString: database.href });
const clients = new Map();
async function call(path, body, account = 'developer', extra = {}) {
  const r = await fetch(base + path, {
    method: body ? (path === '/api/data' ? 'PUT' : 'POST') : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      'X-CRM-Workspace': 'nexo',
      cookie: clients.get(account) || '',
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of r.headers.getSetCookie())
    if (cookie.startsWith('nexo_session=')) clients.set(account, cookie.split(';')[0]);
  return { status: r.status, body: await r.json() };
}
function ok(r, status = 200) {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
}
try {
  ok(await call('/api/auth'));
  await db.connect();
  assert.equal(
    Number((await db.query('SELECT count(*) FROM app_users')).rows[0].count),
    0,
    'Use a fresh fixture',
  );
  for (const [username, role, permissions] of [
    ['developer', 'developer', null],
    ['restricted', 'admin', { views: ['Empresas'], actions: ['companies'] }],
    ['sales', 'commercial', null],
  ]) {
    const salt = randomBytes(16).toString('hex');
    const id = randomUUID();
    await db.query(
      'INSERT INTO app_users(id,username,password_hash,role,profile,must_change,permissions) VALUES($1,$2,$3,$4,$2,false,$5)',
      [
        id,
        username,
        salt + ':' + scryptSync(password, salt, 64).toString('hex'),
        role,
        permissions,
      ],
    );
    await db.query(
      "INSERT INTO crm_memberships(workspace_id,user_id,role,profile,permissions) VALUES('nexo',$1,$2,$3,$4)",
      [id, role, username, permissions],
    );
    ok(await call('/api/auth', { action: 'login', username, password }, username));
  }
  ok(await call('/api/commercial-data', undefined, 'anonymous'), 401);
  ok(await call('/api/commercial-data', undefined, 'restricted'), 403);
  ok(await call('/api/commercial-data', undefined, 'sales'), 403);
  const command = {
    action: 'import',
    kind: 'companies',
    csv: 'Nombre;CIF\nFixture One;TEST001\nFixture Two;TEST002',
    mapping: { name: 0, taxId: 1 },
    owner: 'developer',
  };
  const preview = ok(await call('/api/commercial-data', { ...command, preview: true }));
  assert.equal(preview.rows.length, 2);
  ok(
    await call(
      '/api/commercial-data',
      { ...command, preview: false, selected: [2, 3], version: preview.version },
      'developer',
      { Origin: 'https://untrusted.example' },
    ),
    403,
  );
  ok(
    await call('/api/commercial-data', {
      ...command,
      preview: false,
      selected: [2, 3],
      version: preview.version,
    }),
  );
  ok(
    await call('/api/commercial-data', {
      ...command,
      preview: false,
      selected: [2],
      version: preview.version,
    }),
    409,
  );
  let state = ok(await call('/api/data'));
  const source = state.data.companies.find((c) => c.taxId === 'TEST001');
  const target = state.data.companies.find((c) => c.taxId === 'TEST002');
  assert.ok(source && target);
  const note = {
    id: randomUUID(),
    companyId: source.id,
    kind: 'Llamada',
    text: 'Fixture conversation',
  };
  ok(await call('/api/company-history', note));
  ok(await call('/api/company-history', note)); // retry must not duplicate
  assert.equal(ok(await call('/api/company-history?company=' + source.id)).total, 1);
  ok(await call('/api/company-history?company=' + source.id, undefined, 'sales'), 404);
  ok(await call('/api/company-history', { ...note, text: 'changed' }), 409);
  state = ok(await call('/api/data'));
  const deleted = structuredClone(state.data);
  deleted.companies = deleted.companies.filter((c) => c.id !== source.id);
  ok(await call('/api/data', { version: state.version, data: deleted }), 422);
  const contact = {
    action: 'import',
    kind: 'contacts',
    csv: 'Nombre;Empresa;Correo\nContact;TEST001;contact@example.com',
    mapping: { name: 0, company: 1, email: 2 },
  };
  const cp = ok(await call('/api/commercial-data', { ...contact, preview: true }));
  ok(
    await call('/api/commercial-data', {
      ...contact,
      preview: false,
      selected: [2],
      version: cp.version,
    }),
  );
  const merge = {
    action: 'merge',
    kind: 'companies',
    sourceId: source.id,
    targetId: target.id,
    choices: {},
  };
  const mp = ok(await call('/api/commercial-data', { ...merge, preview: true }));
  assert.equal(mp.impact.companyNotes, 1);
  assert.equal(mp.impact.contacts, 1);
  ok(await call('/api/commercial-data', { ...merge, preview: false, version: mp.version }));
  state = ok(await call('/api/data'));
  assert.equal(
    state.data.companies.some((c) => c.id === source.id),
    false,
  );
  assert.equal(
    state.data.contacts.find((c) => c.email === 'contact@example.com').companyId,
    target.id,
  );
  assert.equal(
    ok(await call('/api/company-history?company=' + target.id)).entries[0].text,
    note.text,
  );
  ok(await call('/api/company-history?company=' + source.id), 404);
  assert.equal(ok(await call('/api/commercial-data')).events.length, 3);
  ok(
    await call('/api/commercial-data', undefined, 'developer', { 'X-CRM-Workspace': 'wrong' }),
    401,
  );
  const initial = ok(await call('/api/business-settings'));
  ok(
    await call(
      '/api/business-settings',
      { version: initial.version, settings: initial.settings },
      'sales',
    ),
    403,
  );
  let settings = structuredClone(initial.settings);
  settings.setupComplete = true;
  settings.fields = [
    {
      id: 'field_size',
      entity: 'companies',
      label: 'Tamaño',
      type: 'number',
      options: [],
      archived: false,
    },
  ];
  settings.phases.push({
    id: 'qualification',
    label: 'Cualificación',
    kind: 'En preparación',
    color: '#2563eb',
  });
  settings.automation = {
    ...settings.automation,
    followUp: false,
    pendingOnSend: false,
    activateOnWin: false,
  };
  ok(
    await call('/api/business-settings', {
      version: initial.version,
      settings,
      brand: { ...initial.brand, currency: 'USD' },
      initialData: 'keep',
    }),
  );
  ok(await call('/api/business-settings', { version: initial.version, settings }), 409);
  state = ok(await call('/api/data'));
  state.data.companies.find((c) => c.id === target.id).customFields = { field_size: '22.5' };
  state.data.deals.push({
    id: 'configured-deal',
    companyId: target.id,
    title: 'Configured deal',
    owner: 'developer',
    stage: 'En preparación',
    pipelinePhase: 'qualification',
    lines: [{ description: 'Service', qty: 1, price: 10, discount: 0, tax: 21 }],
    versions: [],
  });
  ok(await call('/api/data', { version: state.version, data: state.data }));
  let current = ok(await call('/api/business-settings'));
  const removed = structuredClone(settings);
  removed.fields = [];
  ok(await call('/api/business-settings', { version: current.version, settings: removed }), 422);
  const removedPhase = structuredClone(settings);
  removedPhase.phases = removedPhase.phases.filter((p) => p.id !== 'qualification');
  ok(
    await call('/api/business-settings', { version: current.version, settings: removedPhase }),
    422,
  );
  state = ok(await call('/api/data'));
  let deal = state.data.deals.find((d) => d.id === 'configured-deal');
  deal.versions.push({
    id: 'configured-revision',
    date: '2026-11-17',
    lines: structuredClone(deal.lines),
  });
  ok(await call('/api/data', { version: state.version, data: state.data }));
  state = ok(await call('/api/data'));
  deal = state.data.deals.find((d) => d.id === 'configured-deal');
  deal.versions[0].sentAt = '2026-11-17T12:00:00Z';
  ok(await call('/api/data', { version: state.version, data: state.data }));
  state = ok(await call('/api/data'));
  assert.equal(state.data.deals.find((d) => d.id === 'configured-deal').stage, 'En preparación');
  assert.equal(
    state.data.tasks.some((t) => t.quoteRevisionId === 'configured-revision'),
    false,
  );
  assert.equal(
    state.data.deals.find((d) => d.id === 'configured-deal').versions[0].snapshot.brand.currency,
    'USD',
  );
  current = ok(await call('/api/business-settings'));
  ok(
    await call('/api/business-settings', {
      version: current.version,
      settings,
      brand: { ...current.brand, currency: 'EUR' },
    }),
    422,
  );
  const minimal = { ...settings, modules: ['Tratos'] };
  ok(await call('/api/business-settings', { version: current.version, settings: minimal }));
  state = ok(await call('/api/data'));
  assert.equal(state.data.contacts.length, 0);
  assert.equal(state.data.deals.find((d) => d.id === 'configured-deal').versions.length, 0);
  state.data.deals.push({
    id: 'simple-deal',
    companyId: target.id,
    title: 'Simple deal',
    owner: 'developer',
    stage: 'En preparación',
    lines: [],
    versions: [],
  });
  ok(await call('/api/data', { version: state.version, data: state.data }));
  state = ok(await call('/api/data'));
  state.data.deals.find((d) => d.id === 'simple-deal').stage = 'Ganado';
  ok(await call('/api/data', { version: state.version, data: state.data }));
  state = ok(await call('/api/data'));
  assert.equal(state.data.companies.find((c) => c.id === target.id).status, 'Posible cliente');
  current = ok(await call('/api/business-settings'));
  ok(await call('/api/business-settings', { version: current.version, settings }));
  state = ok(await call('/api/data'));
  assert.ok(state.data.contacts.find((c) => c.email === 'contact@example.com'));
  assert.equal(state.data.deals.find((d) => d.id === 'configured-deal').versions.length, 1);
  assert.equal(
    state.data.orders.some((o) => o.dealId === 'simple-deal'),
    false,
  );
  assert.equal(
    state.data.companies.find((c) => c.id === target.id).customFields.field_size,
    '22.5',
  );
  // Onboarding in a distinct workspace must not overwrite the original company's data.
  const created = ok(
    await call('/api/workspaces', {
      action: 'create',
      brand: { ...initial.brand, name: 'Onboarding fixture' },
    }),
    201,
  ).workspace;
  const otherHeaders = {
    'X-CRM-Workspace': created.id,
    cookie: clients.get('developer') + '; nexo_workspace=' + created.id,
  };
  const otherState = ok(await call('/api/data', undefined, 'developer', otherHeaders));
  assert.equal(otherState.data.companies.length, 0);
  const otherConfig = ok(
    await call('/api/business-settings', undefined, 'developer', otherHeaders),
  );
  ok(
    await call(
      '/api/business-settings',
      {
        version: otherConfig.version,
        brand: otherConfig.brand,
        settings: { ...otherConfig.settings, setupComplete: true },
        initialData: 'examples',
      },
      'developer',
      otherHeaders,
    ),
  );
  const examples = ok(await call('/api/data', undefined, 'developer', otherHeaders));
  assert.ok(examples.data.companies.length > 0);
  assert.ok(examples.data.companies.every((c) => c.owner === 'developer'));
  const completed = ok(await call('/api/business-settings', undefined, 'developer', otherHeaders));
  ok(
    await call(
      '/api/business-settings',
      { version: completed.version, settings: completed.settings, initialData: 'examples' },
      'developer',
      otherHeaders,
    ),
    422,
  );
  assert.equal(
    ok(await call('/api/data')).data.companies.find((c) => c.id === target.id).customFields
      .field_size,
    '22.5',
  );
  ok(
    await call('/api/data', undefined, 'sales', {
      'X-CRM-Workspace': created.id,
      cookie: clients.get('sales') + '; nexo_workspace=' + created.id,
    }),
    401,
  );
  await db.query(
    "UPDATE app_sessions SET last_seen=now()-interval '5 minutes' WHERE user_id=(SELECT id FROM app_users WHERE username='developer')",
  );
  const lastSeen = (
    await db.query(
      "SELECT max(last_seen) AS at FROM app_sessions WHERE user_id=(SELECT id FROM app_users WHERE username='developer')",
    )
  ).rows[0].at;
  ok(await call('/api/auth', undefined, 'developer', { 'X-Session-Probe': '1' }));
  const passive = (
    await db.query(
      "SELECT max(last_seen) AS at FROM app_sessions WHERE user_id=(SELECT id FROM app_users WHERE username='developer')",
    )
  ).rows[0].at;
  assert.equal(
    passive.getTime(),
    lastSeen.getTime(),
    'Passive configuration checks must not extend idle sessions',
  );
  console.log(
    'OK: import, contacts, stale preview, merge, notes, history, permissions, origin, workspace, configuration, fields, stages, currency and module guards',
  );
} finally {
  await db.end();
}
