import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { validWorkControl, workBudget } from '../src/domain/work-control.ts';
import { workCosts, compareWorkCost } from '../src/domain/labor.ts';
import { visibleData, applyAuthorized } from '../src/application/access.ts';
const work = {
  id: 'w',
  companyId: 'c1',
  orderId: '',
  owner: 'Alex',
  responsible: 'Alex',
  start: '',
  end: '',
  name: 'Obra',
  status: 'En curso',
  progress: 0,
  notes: '',
  workerIds: ['a'],
};
const entry = { id: 's', date: '2026-11-12', person: 'Alex', hours: 2, rate: 30, notes: 'Visita' };
test('Surface, budget and duration are independent and invalid values are rejected', () => {
  assert.ok(validWorkControl({ ...work, areaM2: 70, budgetAmount: 3000, plannedDays: 5 }));
  for (const field of ['areaM2', 'budgetAmount', 'plannedDays'])
    for (const value of [-1, Infinity, '5'])
      assert.equal(validWorkControl({ ...work, [field]: value }), false);
  assert.equal(
    validWorkControl({ ...work, actualStart: '2026-11-12', actualEnd: '2026-11-11' }),
    false,
  );
  assert.equal(validWorkControl({ ...work, actualStart: '2026-02-30' }), false);
});
test('Supervision rejects duplicate ids and more than 24 hours for a person/day', () => {
  assert.ok(validWorkControl({ ...work, supervision: [entry] }));
  assert.equal(validWorkControl({ ...work, supervision: [entry, entry] }), false);
  assert.equal(
    validWorkControl({
      ...work,
      supervision: [
        { ...entry, hours: 23 },
        { ...entry, id: 's2' },
      ],
    }),
    false,
  );
  assert.equal(validWorkControl({ ...work, supervision: [{ ...entry, rate: -1 }] }), false);
});
test('Costs include supervision and all confirmed expenses once; missing rates remain incomplete', () => {
  const data = {
    ...seed(),
    works: [{ ...work, supervision: [entry, { ...entry, id: 's2', hours: 3, rate: null }] }],
    laborReports: [],
    siteReports: [],
    workExpenses: ['Materiales', 'Dietas', 'Alojamientos', 'Gasolina', 'Otros'].map((kind, i) => ({
      id: String(i),
      workId: 'w',
      kind,
      amount: 10,
      status: 'Confirmado',
    })),
  };
  data.workExpenses.push({
    id: 'pending',
    workId: 'w',
    kind: 'Dietas',
    amount: 100,
    status: 'Pendiente',
  });
  const c = workCosts(data, 'w');
  assert.equal(c.total, 110);
  assert.equal(c.supervisionHours, 5);
  assert.equal(c.supervisionMissingHours, 3);
  assert.equal(c.diets, 10);
  assert.equal(c.pendingExpenses, 100);
  assert.ok(compareWorkCost(data, data.works[0]).incomplete);
});
test('Budget uses linked order net amount; manual amount applies only without an order', () => {
  const data = {
    ...seed(),
    orders: [{ id: 'o', lines: [{ qty: 2, price: 100, discount: 10, tax: 21 }] }],
  };
  assert.equal(workBudget(data, { ...work, orderId: 'o', budgetAmount: 999 }), 180);
  assert.equal(workBudget(data, { ...work, budgetAmount: 3000 }), 3000);
  assert.equal(workBudget(data, work), null);
});
test('Workers cannot see budget or supervision rates, nor alter supervision', () => {
  const data = { ...seed(), works: [{ ...work, budgetAmount: 3000, supervision: [entry] }] };
  const user = {
    id: 'u',
    role: 'worker',
    username: 'worker',
    profile: 'operario:a',
    mustChange: false,
  };
  const visible = visibleData(data, user);
  assert.equal(visible.works[0].budgetAmount, null);
  assert.deepEqual(visible.works[0].supervision, []);
  visible.works[0].supervision = [entry];
  assert.throws(
    () => applyAuthorized(data, visible, user, '2026-11-12T12:00:00Z'),
    /permiso|partes/,
  );
});
