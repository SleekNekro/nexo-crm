import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSettings,
  validateSettings,
  validateConfigurationChange,
  validateCustomData,
  phaseFor,
} from '../src/domain/business-settings.ts';
import { seed } from '../src/domain/model.ts';
import { markQuoteSent, issueQuote } from '../src/domain/actions.ts';
import { reconcileCommercialChange } from '../src/application/business-rules.ts';
import { canView, canAct, canManageAccount } from '../src/domain/permissions.ts';
import { quoteDocument } from '../src/presentation/documents/quote-document.ts';
import { nexoBrand } from '../src/domain/workspace.ts';
const config = () => structuredClone(defaultSettings);
test('configuration validates module dependencies, field identities and phase meanings', () => {
  validateSettings(config());
  const c = config();
  c.modules = ['Tratos'];
  validateSettings(c);
  c.modules = ['Presupuestos'];
  assert.throws(() => validateSettings(c), /necesita/);
  const p = config();
  p.phases[0].kind = 'Ganado';
  assert.throws(() => validateSettings(p));
  const f = config();
  f.fields = [
    {
      id: '__proto__',
      entity: 'companies',
      label: 'Test',
      type: 'text',
      options: [],
      archived: false,
    },
  ];
  assert.throws(() => validateSettings(f));
});
test('custom fields validate types and archive without losing existing values', () => {
  const c = config();
  c.fields = [
    {
      id: 'field_number',
      label: 'Size',
      entity: 'companies',
      type: 'number',
      options: [],
      archived: false,
    },
  ];
  const d = seed();
  d.companies[0].customFields = { field_number: '12.5' };
  validateCustomData(d, c);
  const next = structuredClone(c);
  next.fields[0].archived = true;
  validateConfigurationChange(c, next, d);
  next.fields = [];
  assert.throws(() => validateConfigurationChange(c, next, d), /tiene datos/);
  d.companies[0].customFields.field_number = 'Infinity';
  assert.throws(() => validateCustomData(d, c), /número/);
  d.companies[0].customFields = { unknown: 'x' };
  assert.throws(() => validateCustomData(d, c), /desconocido/);
});
test('phase is independent of its label, cannot remove phases with deals', () => {
  const c = config();
  c.phases.push({
    id: 'qualification',
    label: 'Cualificación',
    kind: 'En preparación',
    color: '#123456',
  });
  const d = seed();
  d.deals[0].stage = 'En preparación';
  d.deals[0].pipelinePhase = 'qualification';
  validateCustomData(d, c);
  assert.equal(phaseFor(d.deals[0], c).label, 'Cualificación');
  assert.throws(() => validateConfigurationChange(c, config(), d), /Mueve primero/);
  d.deals[0].stage = 'Ganado';
  assert.throws(() => validateCustomData(d, c), /etapa/);
});
test('disabled modules restrict reads and actions, including developers', () => {
  const c = config();
  c.modules = ['Tratos'];
  const u = { role: 'developer', workspace: { settings: c } };
  assert.equal(canView(u, 'Presupuestos'), false);
  assert.equal(canAct(u, 'products'), false);
  assert.equal(canView(u, 'Empresas'), true);
});
test('send rules can be disabled and applied once without changing the chosen phase', () => {
  const c = config();
  c.automation.followUp = false;
  c.automation.pendingOnSend = false;
  let d = seed();
  d.deals[0].stage = 'En preparación';
  d = issueQuote(d, d.deals[0].id, 'rule-v', '2026-11-17');
  const before = d.tasks.length;
  d = markQuoteSent(
    d,
    d.deals[0].id,
    'rule-v',
    '2026-11-17T12:00:00Z',
    '',
    () => 'task-new',
    c.automation,
  );
  assert.equal(d.tasks.length, before);
  assert.equal(d.deals[0].stage, 'En preparación');
  assert.equal(
    markQuoteSent(
      d,
      d.deals[0].id,
      'rule-v',
      '2026-11-17T12:00:00Z',
      '',
      () => 'again',
      c.automation,
    ).tasks.length,
    before,
  );
});
test('simple CRM can win an unpriced deal without generating a disabled order or activating the company', () => {
  const c = config();
  c.modules = ['Tratos'];
  c.automation.activateOnWin = false;
  const before = seed();
  before.deals[0].lines = [];
  before.deals[0].versions = [];
  before.deals[0].stage = 'En preparación';
  before.companies[0].status = 'Posible cliente';
  const input = structuredClone(before);
  input.deals[0].stage = 'Ganado';
  const n = reconcileCommercialChange(before, input, () => crypto.randomUUID(), '2026-11-17', c);
  assert.equal(n.orders.length, before.orders.length);
  assert.equal(n.companies[0].status, 'Posible cliente');
});
test('historical PDF uses its frozen currency', () => {
  const d = seed();
  const deal = d.deals[0];
  const v = {
    id: 'v',
    date: '2026-11-17',
    lines: deal.lines,
    snapshot: {
      title: deal.title,
      owner: deal.owner,
      client: d.companies[0],
      brand: { ...nexoBrand, currency: 'USD' },
    },
  };
  const html = quoteDocument(deal, v, d.companies[0], undefined, '');
  assert.match(html, /US\$|USD|\$/);
  assert.doesNotMatch(html, /€/);
});

test('reordering custom open phases does not move legacy deals implicitly', () => {
  const c = config();
  c.phases.unshift({
    id: 'first_custom',
    label: 'Entrada',
    kind: 'En preparación',
    color: '#ffffff',
  });
  assert.equal(phaseFor({ stage: 'En preparación' }, c).id, 'preparation');
});

test('disabled activation preserves the visible status of legacy companies without explicit status', () => {
  const c = config();
  c.modules = ['Tratos'];
  c.automation.activateOnWin = false;
  const before = seed();
  before.deals = before.deals.filter((d) => d.companyId !== before.companies[0].id);
  before.orders = [];
  before.deals.push({
    id: 'legacy-win',
    companyId: before.companies[0].id,
    title: 'Legacy',
    owner: 'Alex',
    stage: 'En preparación',
    lines: [],
    versions: [],
  });
  const next = structuredClone(before);
  next.deals.find((d) => d.id === 'legacy-win').stage = 'Ganado';
  assert.equal(
    reconcileCommercialChange(before, next, () => crypto.randomUUID(), '2026-11-17', c).companies[0]
      .status,
    'Posible cliente',
  );
});

test('account delegation compares both users within the same enabled modules', () => {
  const c = config();
  c.modules = ['Tratos'];
  assert.equal(
    canManageAccount({ role: 'admin', workspace: { settings: c } }, { role: 'commercial' }),
    true,
  );
  assert.equal(
    canManageAccount({ role: 'admin', workspace: { settings: c } }, { role: 'admin' }),
    false,
  );
});
