import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { removeWorker, archiveWorker, workCosts } from '../src/domain/labor.ts';
import { validateBusinessChange } from '../src/application/business-rules.ts';
const data = () => ({
  ...seed(),
  workers: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  works: [{ id: 'w', workerIds: ['a', 'b'] }],
  laborReports: [],
});
test('elimina persona sin partes y solo sus asignaciones sin mutar origen', () => {
  const d = data(),
    n = removeWorker(d, 'a', 'Dirección');
  assert.deepEqual(n.workers, [{ id: 'b', name: 'B' }]);
  assert.deepEqual(n.works[0].workerIds, ['b']);
  assert.equal(d.workers.length, 2);
  assert.doesNotThrow(() => validateBusinessChange(d, n));
});
test('cualquier parte impide eliminar su autor, también borradores', () => {
  for (const status of ['Borrador', 'Devuelto', 'Pendiente', 'Confirmado']) {
    const d = data();
    d.laborReports = [{ id: 'r', workerId: 'a', status }];
    assert.throws(() => removeWorker(d, 'a', 'Dirección'), /partes/);
    const n = structuredClone(d);
    n.workers.shift();
    assert.throws(() => validateBusinessChange(d, n), /partes/);
  }
});
test('solo dirección puede eliminar una persona existente', () => {
  assert.throws(() => removeWorker(data(), 'a', 'Alex'));
  assert.throws(() => removeWorker(data(), 'missing', 'Dirección'), /encontrada/);
});

test('archivar y restaurar conserva partes, asignaciones y costes', () => {
  const d = data();
  d.laborReports = [
    {
      id: 'r',
      workerId: 'a',
      workId: 'w',
      date: '2026-11-11',
      hours: 8,
      rate: 20,
      status: 'Confirmado',
    },
  ];
  const n = archiveWorker(d, 'a', true, 'Dirección');
  assert.equal(n.workers[0].archived, true);
  assert.deepEqual(n.laborReports, d.laborReports);
  assert.deepEqual(n.works, d.works);
  assert.equal(workCosts(n, 'w').total, 160);
  assert.equal(archiveWorker(n, 'a', false, 'Dirección').workers[0].archived, false);
  assert.equal(d.workers[0].archived, undefined);
  assert.throws(() => archiveWorker(d, 'a', true, 'Alex'));
});
