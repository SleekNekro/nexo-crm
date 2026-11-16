import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { myDay } from '../src/domain/my-day.ts';
test('agenda separa hoy y vencidas y excluye completadas, canceladas y futuras', () => {
  const d = seed();
  d.tasks = ['2026-11-10', '2026-11-11', '2026-11-12'].map((due, i) => ({
    id: String(i),
    owner: 'Alex',
    due,
    done: false,
    title: 'Tarea',
  }));
  d.tasks.push(
    { ...d.tasks[0], id: 'done', done: true },
    { ...d.tasks[0], id: 'cancel', cancelled: 'Cierre' },
    { ...d.tasks[0], id: 'other', owner: 'Ana' },
  );
  const result = myDay(d, 'Alex', '2026-11-11');
  assert.deepEqual(
    result.tasks.map((t) => t.id),
    ['0', '1'],
  );
  assert.equal(result.late, 1);
});
test('partes solo pendientes y de obras que el perfil puede validar', () => {
  const d = seed();
  d.works = [
    { id: 'w1', owner: 'Alex', reviewer: 'Ana' },
    { id: 'w2', owner: 'Alex' },
  ];
  d.laborReports = [
    { id: 'r1', workId: 'w1', status: 'Pendiente', date: '2026-11-10' },
    { id: 'r2', workId: 'w2', status: 'Pendiente', date: '2026-11-11' },
    { id: 'r3', workId: 'w2', status: 'Borrador', date: '2026-11-10' },
  ];
  assert.deepEqual(
    myDay(d, 'Alex', '2026-11-11').reports.map((r) => r.id),
    ['r2'],
  );
  assert.equal(myDay(d, 'Dirección', '2026-11-11').reports.length, 2);
});
test('presupuesto sin siguiente paso excluye cerrados y seguimientos futuros', () => {
  const d = seed();
  d.deals.forEach((deal) => (deal.versions = [{ id: 'v' }]));
  d.tasks = [{ id: 'future', dealId: 'd1', owner: 'Alex', due: '2027-01-01', done: false }];
  assert.deepEqual(
    myDay(d, 'Alex', '2026-11-11').quotes.map((x) => x.id),
    ['d2', 'd4'],
  );
  assert.equal(myDay(d, 'Ana', '2026-11-11').quotes.length, 0);
});
