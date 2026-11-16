import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import {
  possibleDuplicates,
  quoteState,
  dealAlerts,
  validSchedule,
} from '../src/domain/commercial-followup.ts';
import { entityChanges, applyEntityChanges } from '../src/domain/entity-changes.ts';
import { previousPeriod, commercialAnalysis } from '../src/domain/sales-metrics.ts';
test('duplicados normalizan CIF, correo y prefijo español sin comparar vacíos ni el propio registro', () => {
  const rows = [
    {
      id: 'a',
      name: 'Empresa',
      taxId: 'B-12345678',
      email: 'TEST@EXAMPLE.COM',
      phone: '+34 600 123 456',
    },
  ];
  assert.deepEqual(
    possibleDuplicates(rows, {
      taxId: 'b12345678',
      email: 'test@example.com ',
      phone: '600123456',
    })[0].reasons,
    ['CIF', 'correo', 'teléfono'],
  );
  assert.equal(possibleDuplicates(rows, { id: 'a', taxId: 'B12345678' }).length, 0);
  assert.equal(possibleDuplicates(rows, {}).length, 0);
});
test('estado de presupuesto usa última revisión y respeta aceptado y 30 días de validez', () => {
  const d = seed().deals[0];
  d.versions = [];
  assert.equal(quoteState(d, '2026-11-12'), 'Borrador');
  d.versions = [{ id: 'v', date: '2026-10-13T12:00:00Z', sentAt: '2026-10-15', lines: [] }];
  assert.equal(quoteState(d, '2026-11-12'), 'Enviado');
  assert.equal(quoteState(d, '2026-11-13'), 'Caducado');
  d.acceptedRevisionId = 'v';
  assert.equal(quoteState(d, '2027-01-01'), 'Aceptado');
});
test('alertas no inventan antigüedad histórica ni señalan tratos cerrados', () => {
  const d = seed().deals[0];
  delete d.updatedAt;
  assert.deepEqual(dealAlerts(d, [], '2026-11-12'), ['Sin siguiente actividad']);
  d.updatedAt = '2026-10-20';
  assert.equal(dealAlerts(d, [], '2026-11-12').length, 2);
  d.stage = 'Ganado';
  assert.deepEqual(dealAlerts(d, []), []);
});
test('horarios validan límites y permiten actividades sin hora', () => {
  assert.ok(validSchedule({}));
  assert.ok(validSchedule({ time: '09:30', durationMinutes: 45 }));
  for (const t of [
    { time: '24:00' },
    { durationMinutes: 30 },
    { time: '09:00', durationMinutes: -1 },
    { time: '09:00', durationMinutes: 1.5 },
  ])
    assert.equal(validSchedule(t), false);
});
test('cambios por registro conservan todo lo demás y rechazan colecciones y ids falsos', () => {
  const a = seed(),
    b = structuredClone(a);
  b.companies[0].city = 'Nueva';
  b.contacts.pop();
  const changes = entityChanges(a, b);
  assert.equal(changes.length, 2);
  assert.deepEqual(applyEntityChanges(a, changes), b);
  assert.throws(() => applyEntityChanges(a, [{ collection: '__proto__', id: 'x', value: null }]));
  assert.throws(() =>
    applyEntityChanges(a, [{ collection: 'companies', id: 'x', value: { id: 'y' } }]),
  );
  assert.throws(() =>
    applyEntityChanges(a, [{ collection: 'companies', id: 'missing', value: null }]),
  );
  assert.throws(() => applyEntityChanges(a, [changes[0], changes[0]]));
});
test('periodos comparables cruzan meses y años; cierres históricos sin creación no se inventan', () => {
  assert.deepEqual(previousPeriod('2026-01-01', '2026-01-10'), {
    from: '2025-12-22',
    to: '2025-12-31',
  });
  const d = seed(),
    event = {
      kind: 'stage_changed',
      entityId: d.deals[0].id,
      owner: d.deals[0].owner,
      toStage: 'Ganado',
      at: '2026-11-12T12:00:00Z',
      amount: 100,
    };
  const unknown = commercialAnalysis(d, [event], [], '2026-11-12').find(
    (r) => r.owner === event.owner,
  );
  assert.equal(unknown.averageCloseDays, null);
  const known = commercialAnalysis(d, [event], [], '2026-11-12', {
    [event.entityId]: '2026-11-02T12:00:00Z',
  }).find((r) => r.owner === event.owner);
  assert.equal(known.averageCloseDays, 10);
  assert.equal(known.measuredClosures, 1);
});

test('presupuesto ganado histórico conserva clasificación aceptado sin revisión vinculada', () => {
  const d = seed().deals[0];
  d.stage = 'Ganado';
  d.versions = [];
  delete d.acceptedRevisionId;
  assert.equal(quoteState(d), 'Aceptado');
});
