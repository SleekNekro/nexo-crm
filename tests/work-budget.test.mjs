import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { compareWorkCost, saveLabor, reviewLabor } from '../src/domain/labor.ts';
import { validData, saveWork } from '../src/domain/actions.ts';
import { visibleData } from '../src/application/access.ts';
const now = '2026-11-11T12:00:00Z';
const setup = () => ({
  ...seed(),
  workers: [{ id: 'a', name: 'A', kind: 'Propio', company: '', rate: 20 }],
  works: [
    {
      id: 'w',
      companyId: 'c1',
      orderId: '',
      name: 'Obra',
      address: '',
      owner: 'Alex',
      responsible: 'Alex',
      workerIds: ['a'],
      start: '',
      end: '',
      status: 'En curso',
      progress: 0,
      notes: '',
      plannedCost: 100,
    },
  ],
});
test('previsión compara solo costes confirmados y conserva pendientes aparte', () => {
  let d = setup();
  d = saveLabor(
    d,
    {
      id: 'r',
      workId: 'w',
      workerId: 'a',
      date: '2026-11-11',
      hours: 8,
      summary: 'Trabajo',
      incidents: '',
      photos: [],
      status: 'Borrador',
      rate: null,
      history: [],
      createdAt: now,
      updatedAt: now,
    },
    'a',
    true,
    now,
  );
  assert.deepEqual(compareWorkCost(d, d.works[0]), {
    planned: 100,
    actual: 0,
    remaining: 100,
    exceeded: false,
    percent: 0,
    incomplete: true,
  });
  d = reviewLabor(d, 'r', 'Confirmar', 'Alex', '', now);
  const b = compareWorkCost(d, d.works[0]);
  assert.equal(b.actual, 160);
  assert.equal(b.remaining, -60);
  assert.equal(b.percent, 160);
  assert.equal(b.exceeded, true);
  assert.equal(b.incomplete, false);
});
test('sin previsión y cero son distintos; no expone coste previsto al operario', () => {
  const d = setup();
  d.works[0].plannedCost = null;
  assert.equal(compareWorkCost(d, d.works[0]).remaining, null);
  d.works[0].plannedCost = 0;
  assert.equal(compareWorkCost(d, d.works[0]).remaining, 0);
  assert.equal(compareWorkCost(d, d.works[0]).percent, null);
  d.works[0].plannedCost = 1234;
  assert.equal(
    visibleData(d, {
      id: 'u',
      username: 'op',
      role: 'worker',
      profile: 'operario:a',
      mustChange: false,
    }).works[0].plannedCost,
    null,
  );
  assert.equal(validData(d), true);
  assert.throws(() => saveWork(d, { ...d.works[0], plannedCost: -1 }));
  assert.equal(validData({ ...d, works: [{ ...d.works[0], plannedCost: '100' }] }), false);
});
