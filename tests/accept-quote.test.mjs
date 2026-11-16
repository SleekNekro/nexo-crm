import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import {
  issueQuote,
  acceptQuote,
  createWorkFromOrder,
  changeStage,
  validData,
} from '../src/domain/actions.ts';
import {
  validateBusinessChange,
  reconcileCommercialChange,
} from '../src/application/business-rules.ts';
import { salesChanges } from '../src/domain/sales-metrics.ts';
const day = '2026-11-11';
let seq = 0;
const id = () => `accept-test-${++seq}`;
function fixture() {
  let d = seed();
  d.deals[0].lines[0].unit = 'm²';
  d = issueQuote(d, 'd1', 'v1', day);
  d.deals[0].lines[0].price = 1000;
  return d;
}
test('aceptar revisión anterior conserva el borrador, genera pedido exacto y no crea obra', () => {
  const before = fixture(),
    after = acceptQuote(before, 'd1', 'v1', day, id),
    order = after.orders.find((o) => o.dealId === 'd1');
  assert.deepEqual(order.lines, before.deals[0].versions[0].lines);
  assert.equal(order.revisionId, 'v1');
  assert.equal(after.deals[0].lines[0].price, 1000);
  assert.equal(after.deals[0].stage, 'Ganado');
  assert.equal(after.works?.length || 0, 0);
  assert.doesNotThrow(() => validateBusinessChange(before, after));
  assert.equal(validData(after), true);
  assert.deepEqual(acceptQuote(after, 'd1', 'v1', day, id), after);
  const reconciled = reconcileCommercialChange(before, after, id, day);
  assert.equal(
    reconciled.companies.find((c) => c.id === after.deals[0].companyId).status,
    'Cliente activo',
  );
  assert.deepEqual(reconciled.deals, after.deals);
  assert.deepEqual(reconciled.orders, after.orders);
  assert.equal(
    salesChanges(before, after, new Set()).find(
      (e) => e.kind === 'stage_changed' && e.entityId === 'd1',
    ).amount,
    5712,
  );
});
test('no cambia aceptación ni pedido previo y no permite ganar con revisiones sin elegir', () => {
  const before = fixture();
  assert.throws(() => changeStage(before, 'd1', 'Ganado', id, day), /revisión/);
  const after = acceptQuote(before, 'd1', 'v1', day, id);
  const bad = structuredClone(after);
  bad.deals[0].acceptedAt = '2026-11-10';
  assert.throws(() => validateBusinessChange(after, bad), /aceptación/);
  assert.throws(() => acceptQuote(seed(), 'd3', 'missing', day, id));
});
test('obra opcional copia pedido, mantiene coste y horas sin definir y evita duplicados', () => {
  const accepted = acceptQuote(fixture(), 'd1', 'v1', day, id),
    order = accepted.orders.find((o) => o.dealId === 'd1');
  const withWork = createWorkFromOrder(accepted, order.id, 'Alex', id),
    work = withWork.works[0];
  assert.equal(work.status, 'Planificada');
  assert.equal(work.orderId, order.id);
  assert.equal(work.plannedCost, null);
  assert.equal(withWork.workItems[0].plannedQty, 84);
  assert.equal(withWork.workItems[0].plannedHours, null);
  assert.equal(withWork.workItems[0].source, 'order:' + order.id);
  assert.equal(validData(withWork), true);
  assert.doesNotThrow(() => validateBusinessChange(accepted, withWork));
  assert.throws(() => createWorkFromOrder(withWork, order.id, 'Alex', id), /ya tiene/);
  assert.throws(() => createWorkFromOrder(accepted, order.id, 'Ana', id), /responsable/);
  const duplicate = structuredClone(withWork);
  duplicate.works.push({ ...work, id: 'duplicate' });
  assert.throws(() => validateBusinessChange(withWork, duplicate), /vinculada/);
});
