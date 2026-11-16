import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { issueQuote, markQuoteSent } from '../src/domain/actions.ts';
import { validateBusinessChange, validBusinessDate } from '../src/application/business-rules.ts';
const now = '2026-11-11';
test('revisiones emitidas no se editan ni eliminan, pero permiten registrar envío', () => {
  const before = issueQuote(seed(), 'd1', 'v1', now);
  for (const change of [
    (d) => d.deals[0].versions[0].lines[0].price++,
    (d) => (d.deals[0].versions[0].snapshot.client.name = 'Otra'),
    (d) => (d.deals[0].versions = []),
    (d) => d.deals.shift(),
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.throws(() => validateBusinessChange(before, after));
  }
  const sent = markQuoteSent(before, 'd1', 'v1', now, '2026-11-12', () => 'seguimiento');
  assert.doesNotThrow(() => validateBusinessChange(before, sent));
  const changed = structuredClone(sent);
  changed.deals[0].versions[0].sentAt = '2026-11-10';
  assert.throws(() => validateBusinessChange(sent, changed), /envío/);
});
test('relaciones comerciales e identificadores conservan integridad', () => {
  const before = seed();
  for (const change of [
    (d) => d.companies.shift(),
    (d) => (d.contacts[0].companyId = 'no-existe'),
    (d) => (d.deals[0].contactId = d.contacts[1].id),
    (d) => (d.tasks[0].dealId = 'no-existe'),
    (d) => d.companies.push(d.companies[0]),
    (d) => (d.deals[0].expectedClose = '2026-02-30'),
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.throws(() => validateBusinessChange(before, after));
  }
  assert.doesNotThrow(() => validateBusinessChange(before, before));
});
test('pedidos no se duplican ni alteran; se puede confirmar recepción', () => {
  const before = seed();
  for (const change of [
    (d) => (d.orders = []),
    (d) => d.orders[0].lines[0].price++,
    (d) => d.orders.push({ ...d.orders[0], id: 'otro' }),
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.throws(() => validateBusinessChange(before, after));
  }
  const after = structuredClone(before);
  after.orders[0].status = 'Recibido';
  assert.doesNotThrow(() => validateBusinessChange(before, after));
});
test('mediciones conservan su unidad y su zona aunque se envíen cambios directos', () => {
  const before = {
    ...seed(),
    workItems: [{ id: 'i', workId: 'w', unit: 'm²' }],
    workZones: [{ id: 'z', itemId: 'i' }],
    laborReports: [
      {
        id: 'r',
        workerId: 'p',
        date: now,
        hours: 8,
        status: 'Confirmado',
        measurements: [{ zoneId: 'z', quantity: 10 }],
      },
    ],
  };
  for (const change of [
    (d) => (d.workItems[0].unit = 'kg'),
    (d) => (d.workItems = []),
    (d) => (d.workZones = []),
    (d) => (d.workZones[0].itemId = 'otro'),
  ]) {
    const after = structuredClone(before);
    change(after);
    assert.throws(() => validateBusinessChange(before, after));
  }
});
test('límite de 24 horas agrupa obras pero no personas o fechas distintas', () => {
  const before = seed(),
    after = {
      ...seed(),
      laborReports: [
        { id: 'a', workerId: 'p', date: now, hours: 16, status: 'Confirmado' },
        { id: 'b', workerId: 'p', date: now, hours: 9, status: 'Pendiente' },
      ],
    };
  assert.throws(() => validateBusinessChange(before, after), /24/);
  after.laborReports[1].hours = 8;
  assert.doesNotThrow(() => validateBusinessChange(before, after));
  after.laborReports[1].hours = 9;
  after.laborReports[1].status = 'Devuelto';
  assert.doesNotThrow(() => validateBusinessChange(before, after));
});
test('fecha real: rechaza días inexistentes y acepta años bisiestos', () => {
  assert.equal(validBusinessDate('2026-02-30'), false);
  assert.equal(validBusinessDate('2024-02-29'), true);
  assert.equal(validBusinessDate('2026-02-29'), false);
});

test('servidor reconstruye pedido y cancela seguimientos al ganar sin efectos enviados por cliente', async () => {
  const { reconcileCommercialChange } = await import('../src/application/business-rules.ts');
  const before = seed(),
    input = structuredClone(before);
  input.deals[0].stage = 'Ganado';
  let id = 0;
  const after = reconcileCommercialChange(before, input, () => `generated-${++id}`, now);
  assert.equal(after.orders.filter((o) => o.dealId === 'd1').length, 1);
  assert.equal(after.tasks.find((t) => t.id === 't1').cancelled, 'Cancelada por cierre: Ganado');
  assert.equal(after.tasks.filter((t) => t.dealId === 'd1' && t.kind === 'Recepción').length, 1);
  assert.doesNotThrow(() => validateBusinessChange(before, after));
  assert.deepEqual(
    reconcileCommercialChange(after, after, () => 'unused', now),
    after,
  );
});
test('un cambio de fase inválido no deja pedidos ni muta la entrada', async () => {
  const { reconcileCommercialChange } = await import('../src/application/business-rules.ts');
  const before = seed(),
    input = structuredClone(before);
  input.deals[0].stage = 'Perdido';
  assert.throws(() => reconcileCommercialChange(before, input, () => 'new', now), /motivo/);
  assert.equal(before.deals[0].stage, 'Pendiente del cliente');
  input.deals[0].stage = 'Ganado';
  input.deals[0].lines = [];
  assert.throws(() => reconcileCommercialChange(before, input, () => 'new', now), /partidas/);
});
