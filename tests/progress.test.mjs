import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import {
  workProgress,
  saveWorkItem,
  addWorkZone,
  importWorkItems,
  validProgressData,
} from '../src/domain/progress.ts';
import { saveLabor, reviewLabor, workCosts } from '../src/domain/labor.ts';
import { validData } from '../src/domain/actions.ts';
const now = '2026-11-11T12:00:00Z';
function setup() {
  let d = {
    ...seed(),
    works: [
      {
        id: 'w',
        companyId: 'c1',
        orderId: '',
        name: 'Obra',
        address: '',
        owner: 'Alex',
        responsible: 'Alex',
        workerIds: ['a', 'b'],
        start: '',
        end: '',
        status: 'En curso',
        progress: 99,
        notes: '',
      },
    ],
    workers: [
      { id: 'a', name: 'A', kind: 'Propio', company: '', rate: 20 },
      { id: 'b', name: 'B', kind: 'Propio', company: '', rate: 20 },
    ],
  };
  return saveWorkItem(
    d,
    {
      id: 'i',
      workId: 'w',
      description: 'Revestimiento',
      unit: 'm²',
      plannedQty: 100,
      plannedHours: 20,
    },
    'Alex',
  );
}
function report(id, workerId, quantity, zoneId = 'i-general') {
  return {
    id,
    workId: 'w',
    workerId,
    date: '2026-11-11',
    hours: 4,
    summary: 'Trabajo',
    incidents: '',
    photos: [],
    status: 'Borrador',
    rate: null,
    history: [],
    createdAt: '',
    updatedAt: '',
    measurements: [{ zoneId, quantity }],
  };
}
function confirm(d, r) {
  return reviewLabor(saveLabor(d, r, r.workerId, true, now), r.id, 'Confirmar', 'Alex', '', now);
}
test('dos operarios con los mismos m² cuentan una vez; sus horas cuestan por separado', () => {
  let d = confirm(setup(), report('r1', 'a', 40));
  d = confirm(d, report('r2', 'b', 40));
  assert.equal(workProgress(d, 'w').items[0].executed, 40);
  assert.equal(workProgress(d, 'w').percent, 40);
  assert.equal(workCosts(d, 'w').total, 160);
  assert.ok(validData(d));
});
test('acumulados mayores reemplazan, no se suman; reapertura vuelve al máximo confirmado restante', () => {
  let d = confirm(setup(), report('r1', 'a', 40));
  d = confirm(d, report('r2', 'b', 60));
  assert.equal(workProgress(d, 'w').percent, 60);
  d = reviewLabor(d, 'r2', 'Reabrir', 'Alex', 'Corregir medición', now);
  assert.equal(workProgress(d, 'w').percent, 40);
  d = reviewLabor(d, 'r1', 'Reabrir', 'Alex', 'Corregir', now);
  assert.equal(workProgress(d, 'w').percent, 0);
});
test('pendientes y participación solo horas no aportan ejecución', () => {
  let d = saveLabor(setup(), report('r1', 'a', 40), 'a', true, now);
  d = confirm(d, report('r2', 'b', null));
  assert.equal(workProgress(d, 'w').percent, 0);
  assert.equal(workProgress(d, 'w').items[0].proposed, 40);
});
test('pondera por esfuerzo previsto y no inventa avance global sin pesos', () => {
  let d = confirm(setup(), report('r1', 'a', 100));
  d = saveWorkItem(
    d,
    { id: 'j', workId: 'w', description: 'Sellado', unit: 'm²', plannedQty: 100, plannedHours: 60 },
    'Alex',
  );
  assert.equal(workProgress(d, 'w').percent, 25);
  d = saveWorkItem(d, { ...d.workItems[1], plannedHours: null }, 'Alex');
  assert.equal(workProgress(d, 'w').percent, null);
  assert.equal(workProgress({ ...seed(), works: d.works }, 'w').percent, null);
});
test('zonas distintas se suman, detecta sobre ejecución y nombres duplicados', () => {
  let d = addWorkZone(setup(), 'i', 'Planta 1', 'z1', 'Alex');
  d = addWorkZone(d, 'i', 'Planta 2', 'z2', 'Alex');
  assert.throws(() => addWorkZone(d, 'i', ' PLANTA   1 ', 'z3', 'Alex'));
  d = confirm(d, report('r1', 'a', 60, 'z1'));
  d = saveLabor(d, report('r2', 'b', 60, 'z2'), 'b', true, now);
  assert.throws(() => reviewLabor(d, 'r2', 'Confirmar', 'Alex', '', now), /supera/);
  const bad = structuredClone(d);
  bad.laborReports[1].status = 'Confirmado';
  assert.equal(validProgressData(bad), false);
});
test('no subdivide zona general medida ni cambia unidad con partes; rechaza referencias ajenas', () => {
  let d = confirm(setup(), report('r1', 'a', 40));
  assert.throws(() => addWorkZone(d, 'i', 'Planta 1', 'z1', 'Alex'));
  assert.throws(() => saveWorkItem(d, { ...d.workItems[0], unit: 'ud' }, 'Alex'));
  assert.throws(() => saveLabor(d, report('r2', 'b', 20, 'inexistente'), 'b', true, now));
  assert.throws(() => saveWorkItem(d, { ...d.workItems[0], plannedQty: 20 }, 'Alex'));
});
test('importa instantánea del presupuesto sin mutarla, exige completar peso y evita doble importación', () => {
  const d = setup();
  d.workItems = [];
  d.workZones = [];
  d.deals[0].versions = [
    {
      id: 'v',
      date: now,
      lines: [
        { description: 'Preparación', unit: 'm²', qty: 200, price: 10, discount: 0, tax: 21 },
      ],
    },
  ];
  let n = 0;
  const next = importWorkItems(d, 'w', 'revision:v', 'Alex', () => 'item' + ++n);
  assert.equal(next.workItems[0].plannedQty, 200);
  assert.equal(next.workItems[0].unit, 'm²');
  assert.equal(workProgress(next, 'w').percent, null);
  assert.deepEqual(d.deals, next.deals);
  assert.throws(() => importWorkItems(next, 'w', 'revision:v', 'Alex', () => 'new'));
  assert.throws(() => importWorkItems(d, 'w', 'revision:v', 'Ana', () => 'new'));
});
