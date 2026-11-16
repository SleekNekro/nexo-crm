import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, total, subtotal } from '../src/domain/model.ts';
import {
  changeStage,
  issueQuote,
  validData,
  completeTask,
  editDealData,
  editActivityData,
} from '../src/domain/actions.ts';
let counter = 0;
const id = () => `test-${++counter}`;
test('descuentos e impuestos se aplican en el orden correcto', () => {
  const lines = [{ description: 'Test', qty: 2, price: 100, discount: 10, tax: 21 }];
  assert.equal(subtotal(lines), 180);
  assert.equal(total(lines), 217.8);
});
test('volver a ganar conserva pedido y recepción, cierra seguimientos', () => {
  let d = seed();
  d = changeStage(d, 'd1', 'Ganado', id, '2026-11-10');
  const order = d.orders.find((o) => o.dealId === 'd1');
  d = changeStage(d, 'd1', 'En preparación', id, '2026-11-10');
  d = changeStage(d, 'd1', 'Ganado', id, '2026-11-11');
  assert.equal(d.orders.filter((o) => o.dealId === 'd1').length, 1);
  assert.deepEqual(
    d.orders.find((o) => o.dealId === 'd1'),
    order,
  );
  assert.equal(d.tasks.filter((t) => t.dealId === 'd1' && t.kind === 'Recepción').length, 1);
  assert.equal(d.tasks.find((t) => t.id === 't1').done, false);
  assert.match(d.tasks.find((t) => t.id === 't1').cancelled, /Cancelada por cierre/);
  assert.ok(!d.tasks.find((t) => t.dealId === 'd1' && t.kind === 'Recepción').done);
});
test('revisiones y pedidos conservan sus líneas originales', () => {
  let d = issueQuote(seed(), 'd1', id(), '2026-11-10');
  const price = d.deals[0].versions[0].lines[0].price;
  d.deals[0].lines[0].price = 999;
  assert.equal(d.deals[0].versions[0].lines[0].price, price);
  assert.equal(d.deals[0].stage, 'Pendiente del cliente');
});
test('no permite perder sin motivo ni emitir un presupuesto vacío', () => {
  let d = seed();
  assert.throws(() => changeStage(d, 'd1', 'Perdido', id, '2026-11-10'));
  d.deals[0].lines = [];
  assert.throws(() => issueQuote(d, 'd1', id(), '2026-11-10'));
});
test('rechaza importes negativos y datos malformados', () => {
  const d = seed();
  assert.ok(validData(d));
  d.deals[0].lines[0].price = -1;
  assert.ok(!validData(d));
  assert.ok(!validData({}));
});

test('completar recepción desde actividades actualiza el pedido', () => {
  const d = completeTask(seed(), 't3', true);
  assert.equal(d.orders[0].status, 'Recibido');
  assert.equal(completeTask(d, 't3', false).orders[0].status, 'Pendiente de revisión');
});

test('editar trato conserva documentos y reasigna sus actividades', () => {
  const original = issueQuote(seed(), 'd1', id(), '2026-11-10');
  const deal = original.deals.find((d) => d.id === 'd1');
  const fields = {
    title: 'Nombre actualizado',
    companyId: deal.companyId,
    owner: 'Ana',
    description: 'Detalle',
    expectedClose: '2026-12-01',
  };
  const next = editDealData(original, 'd1', fields);
  assert.deepEqual(next.deals[0].versions, deal.versions);
  assert.deepEqual(next.deals[0].lines, deal.lines);
  assert.equal(next.deals[0].stage, deal.stage);
  assert.ok(next.tasks.filter((t) => t.dealId === 'd1').every((t) => t.owner === 'Ana'));
  assert.equal(original.deals[0].title, deal.title);
  assert.throws(() =>
    editDealData(original, 'd1', {
      ...fields,
      companyId: original.companies.find((c) => c.id !== deal.companyId).id,
    }),
  );
  assert.throws(() => editDealData(original, 'd1', { ...fields, contactId: 'inexistente' }));
});
test('editar actividad conserva vínculo y estado y protege recepción', () => {
  const original = seed(),
    task = original.tasks[0];
  const next = editActivityData(original, task.id, {
    title: 'Seguimiento actualizado',
    due: '2026-12-01',
    kind: 'Visita',
  });
  assert.equal(next.tasks[0].dealId, task.dealId);
  assert.equal(next.tasks[0].done, task.done);
  assert.equal(next.tasks[0].owner, task.owner);
  assert.equal(next.tasks[0].title, 'Seguimiento actualizado');
  assert.throws(() =>
    editActivityData(original, 't3', { title: 'Recepción', due: '2026-12-01', kind: 'Tarea' }),
  );
});
