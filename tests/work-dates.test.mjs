import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedFinish, reconcileWorkDates } from '../src/domain/work-dates.ts';
import { seed } from '../src/domain/model.ts';
const fixture = () => ({
  ...seed(),
  works: [{ id: 'w', start: '2026-11-12', end: '', plannedDays: 5, status: 'En curso' }],
  laborReports: [],
});
test('fin previsto inclusivo por días naturales, sin depender del huso horario', () => {
  assert.equal(plannedFinish('2026-11-12', 5), '2026-11-16');
  assert.equal(plannedFinish('2026-12-31', 2), '2027-01-01');
  assert.equal(plannedFinish('2026-11-12', 1), '2026-11-12');
  assert.equal(plannedFinish('', 5), '');
  assert.equal(plannedFinish('2026-02-30', 5), '');
});
test('inicio real usa fecha del primer parte confirmado, no la fecha de confirmación', () => {
  const before = fixture(),
    next = structuredClone(before);
  next.laborReports = [
    { id: 'a', workId: 'w', status: 'Pendiente', date: '2026-11-01' },
    { id: 'b', workId: 'w', status: 'Confirmado', date: '2026-11-10' },
    { id: 'c', workId: 'w', status: 'Confirmado', date: '2026-11-08' },
  ];
  const result = reconcileWorkDates(before, next, '2026-11-12');
  assert.equal(result.works[0].actualStart, '2026-11-08');
  assert.equal(result.works[0].actualStartManual, false);
  const reopened = structuredClone(result);
  reopened.laborReports[2].status = 'Devuelto';
  assert.equal(
    reconcileWorkDates(result, reopened, '2026-11-13').works[0].actualStart,
    '2026-11-10',
  );
});
test('fin real se fija al finalizar, permanece estable y se limpia al reabrir', () => {
  const before = fixture(),
    next = structuredClone(before);
  next.works[0].status = 'Finalizada';
  const closed = reconcileWorkDates(before, next, '2026-11-12');
  assert.equal(closed.works[0].actualEnd, '2026-11-12');
  assert.equal(reconcileWorkDates(closed, closed, '2026-11-15').works[0].actualEnd, '2026-11-12');
  const reopened = structuredClone(closed);
  reopened.works[0].status = 'En curso';
  assert.equal(reconcileWorkDates(closed, reopened, '2026-11-15').works[0].actualEnd, '');
});
test('conserva correcciones e historia sin inventar fin a obras ya finalizadas', () => {
  const before = fixture();
  before.works[0].actualStart = '2026-10-01';
  before.works[0].status = 'Finalizada';
  const result = reconcileWorkDates(before, before, '2026-11-12');
  assert.equal(result.works[0].actualStart, '2026-10-01');
  assert.equal(result.works[0].actualStartManual, true);
  assert.equal(result.works[0].actualEnd, '');
  result.works[0].actualStartManual = false;
  assert.equal(reconcileWorkDates(before, result, '2026-11-12').works[0].actualStart, '');
});
test('cambiar la planificación recalcula el fin aunque el cliente envíe otro', () => {
  const before = fixture(),
    next = structuredClone(before);
  next.works[0].plannedDays = 3;
  next.works[0].end = '2030-01-01';
  assert.equal(reconcileWorkDates(before, next, '2026-11-12').works[0].end, '2026-11-14');
});
