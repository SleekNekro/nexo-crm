import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { issueQuote, markQuoteSent, changeStage, completeTask } from '../src/domain/actions.ts';
import { quoteDocument } from '../src/presentation/documents/quote-document.ts';
import { mergeIndependent } from '../src/domain/merge.ts';
test('guardar revisión no envía ni cambia la fase y congela datos del cliente', () => {
  const data = seed();
  Object.assign(data.companies[0], {
    taxId: 'B12345678',
    address: 'Calle <Fiscal> 1',
    postalCode: '12530',
    province: 'Castellón',
  });
  data.deals[0].stage = 'En preparación';
  data.deals[0].contactId = data.contacts[0].id;
  const next = issueQuote(data, 'd1', 'version-123', '2026-11-11');
  const d = next.deals[0],
    v = d.versions[0];
  assert.equal(d.stage, 'En preparación');
  assert.equal(v.sentAt, undefined);
  assert.equal(next.tasks.length, data.tasks.length);
  const before = quoteDocument(d, v, next.companies[0], next.contacts[0], '/logo.png');
  assert.ok(before.includes('B12345678'));
  assert.ok(before.includes('Calle &lt;Fiscal&gt; 1'));
  d.title = 'Otro título';
  next.companies[0].taxId = 'B99999999';
  next.companies[0].address = 'Otra dirección';
  next.companies[0].name = 'Otra empresa';
  next.contacts[0].name = 'Otra persona';
  assert.equal(quoteDocument(d, v, next.companies[0], next.contacts[0], '/logo.png'), before);
});
test('registrar envío crea un seguimiento único y cambia fase', () => {
  let data = seed();
  data.deals[0].stage = 'En preparación';
  data = issueQuote(data, 'd1', 'v1', '2026-11-11');
  const count = data.tasks.length;
  data = markQuoteSent(data, 'd1', 'v1', '2026-11-11', '2026-11-15', () => 'followup');
  assert.equal(data.deals[0].stage, 'Pendiente del cliente');
  assert.equal(data.deals[0].versions[0].followUp, '2026-11-15');
  assert.equal(data.tasks.at(-1).due, '2026-11-15');
  assert.equal(
    markQuoteSent(data, 'd1', 'v1', '2026-11-12', '2026-11-16', () => 'duplicate').tasks.length,
    count + 1,
  );
});
test('cerrar cancela pendientes sin alterar tareas ya realizadas; reabrir elimina cancelación', () => {
  let data = seed();
  data.tasks.push({ ...data.tasks[0], id: 'completed', done: true });
  data = changeStage(data, 'd1', 'Perdido', () => 'id', '2026-11-11', 'Sin presupuesto');
  assert.equal(data.tasks.find((t) => t.id === 'completed').cancelled, undefined);
  assert.equal(data.tasks[0].done, false);
  assert.ok(data.tasks[0].cancelled);
  data = completeTask(data, 't1', false);
  assert.equal(data.tasks[0].cancelled, undefined);
  assert.equal(data.tasks[0].done, false);
});
test('concurrencia combina registros independientes y rechaza sobrescritura del mismo registro', () => {
  const base = seed(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.companies[0].city = 'Vitoria';
  remote.tasks[0].title = 'Llamar';
  const merged = mergeIndependent(base, local, remote);
  assert.equal(merged.companies[0].city, 'Vitoria');
  assert.equal(merged.tasks[0].title, 'Llamar');
  remote.companies[0].city = 'Madrid';
  assert.throws(() => mergeIndependent(base, local, remote), /mismo registro/);
  assert.equal(remote.companies[0].city, 'Madrid');
});

test('servidor completa fase y seguimiento aunque el cliente solo registre envío', async () => {
  const { reconcileCommercialChange } = await import('../src/application/business-rules.ts');
  let before = seed();
  before.deals[0].stage = 'En preparación';
  before = issueQuote(before, 'd1', 'send-server', '2026-11-12');
  const input = structuredClone(before);
  Object.assign(input.deals[0].versions[0], { sentAt: '2026-11-12', followUp: '2026-11-15' });
  const after = reconcileCommercialChange(before, input, () => 'server-followup', '2026-11-12');
  assert.equal(after.deals[0].stage, 'Pendiente del cliente');
  assert.equal(after.tasks.filter((t) => t.quoteRevisionId === 'send-server').length, 1);
  assert.equal(after.tasks.at(-1).owner, before.deals[0].owner);
  assert.deepEqual(
    reconcileCommercialChange(after, after, () => 'duplicate', '2026-11-12'),
    after,
  );
  const client = markQuoteSent(
    before,
    'd1',
    'send-server',
    '2026-11-12',
    '2026-11-15',
    () => 'client-followup',
  );
  const saved = reconcileCommercialChange(before, client, () => 'duplicate', '2026-11-12');
  assert.equal(saved.tasks.filter((t) => t.quoteRevisionId === 'send-server').length, 1);
  assert.equal(saved.tasks.at(-1).id, 'client-followup');
});
test('el seguimiento no puede preceder al envío', () => {
  const data = issueQuote(seed(), 'd1', 'date-check', '2026-11-12');
  assert.throws(
    () => markQuoteSent(data, 'd1', 'date-check', '2026-11-12', '2026-11-11', () => 'id'),
    /fecha de seguimiento/,
  );
});
