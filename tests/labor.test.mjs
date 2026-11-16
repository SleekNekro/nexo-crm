import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { saveLabor, reviewLabor, workCosts, saveWorker, saveExpense } from '../src/domain/labor.ts';
import { validData } from '../src/domain/actions.ts';
const setup = () => ({
  ...seed(),
  workers: [
    { id: 'a', name: 'Operario A', kind: 'Propio', company: '', rate: 20 },
    { id: 'b', name: 'Operario B', kind: 'Subcontrata', company: 'Sub', rate: null },
  ],
  works: [
    {
      id: 'w',
      companyId: 'c1',
      orderId: '',
      name: 'Obra',
      address: '',
      owner: 'Alex',
      responsible: 'Alex',
      reviewer: 'Alex',
      workerIds: ['a', 'b'],
      start: '',
      end: '',
      status: 'En curso',
      progress: 0,
      notes: '',
    },
  ],
});
const draft = (workerId = 'a') => ({
  id: 'r',
  workId: 'w',
  workerId,
  date: '2026-11-11',
  hours: 8,
  summary: 'Trabajo',
  incidents: '',
  photos: [],
  status: 'Borrador',
  rate: null,
  history: [],
  createdAt: '',
  updatedAt: '',
});
const now = '2026-11-11T12:00:00Z';
test('horas enviadas no son coste; confirmación congela tarifa y bloquea edición', () => {
  let d = saveLabor(setup(), draft(), 'a', true, now);
  assert.equal(workCosts(d, 'w').total, 0);
  assert.equal(workCosts(d, 'w').pendingHours, 8);
  d = reviewLabor(d, 'r', 'Confirmar', 'Alex', '', now);
  assert.equal(workCosts(d, 'w').total, 160);
  assert.ok(validData(d));
  assert.throws(() => saveLabor(d, draft(), 'a', true, now));
  d.workers[0].rate = 99;
  assert.equal(workCosts(d, 'w').total, 160);
});
test('devolución requiere motivo, permite reenviar y reapertura retira coste', () => {
  let d = saveLabor(setup(), draft(), 'a', true, now);
  assert.throws(() => reviewLabor(d, 'r', 'Devolver', 'Alex', '', now));
  d = reviewLabor(d, 'r', 'Devolver', 'Alex', 'Corrige horas', now);
  d = saveLabor(d, { ...draft(), hours: 6 }, 'a', true, now);
  d = reviewLabor(d, 'r', 'Confirmar', 'Alex', '', now);
  assert.equal(workCosts(d, 'w').total, 120);
  d = reviewLabor(d, 'r', 'Reabrir', 'Alex', 'Revisar', now);
  assert.equal(workCosts(d, 'w').total, 0);
  assert.equal(d.laborReports[0].status, 'Devuelto');
  assert.equal(d.laborReports[0].history.length, 5);
});
test('subcontrata sin tarifa se queda pendiente de valorar hasta aplicación explícita', () => {
  let d = saveLabor(setup(), draft('b'), 'b', true, now);
  d = reviewLabor(d, 'r', 'Confirmar', 'Alex', '', now);
  assert.equal(workCosts(d, 'w').missingHours, 8);
  assert.equal(workCosts(d, 'w').total, 0);
  d = saveWorker(d, { ...d.workers[1], rate: 30 }, 'Dirección');
  assert.equal(workCosts(d, 'w').missingHours, 8);
  d = reviewLabor(d, 'r', 'Valorar', 'Alex', '', now);
  assert.equal(workCosts(d, 'w').total, 240);
  assert.throws(() => reviewLabor(d, 'r', 'Valorar', 'Alex', '', now));
});
test('rechaza otros autores, obras no asignadas y revisores ajenos', () => {
  let d = setup();
  assert.throws(() => saveLabor(d, draft(), 'b', true, now));
  d.works[0].workerIds = [];
  assert.throws(() => saveLabor(d, draft(), 'a', true, now));
  d = saveLabor(setup(), draft(), 'a', true, now);
  assert.throws(() => reviewLabor(d, 'r', 'Confirmar', 'Ana', '', now));
  assert.throws(() => saveWorker(d, d.workers[0], 'Alex'));
});
test('limita total diario y suma solo gastos confirmados', () => {
  let d = saveLabor(setup(), { ...draft(), hours: 20 }, 'a', true, now);
  assert.throws(() => saveLabor(d, { ...draft(), id: 'r2', hours: 8 }, 'a', true, now));
  d = saveExpense(
    d,
    {
      id: 'e',
      workId: 'w',
      concept: 'Material',
      date: '2026-11-11',
      kind: 'Materiales',
      amount: 50,
      status: 'Pendiente',
    },
    'Alex',
  );
  assert.equal(workCosts(d, 'w').total, 0);
  assert.equal(workCosts(d, 'w').pendingExpenses, 50);
  d = saveExpense(d, { ...d.workExpenses[0], status: 'Confirmado' }, 'Alex');
  assert.equal(workCosts(d, 'w').total, 50);
});
