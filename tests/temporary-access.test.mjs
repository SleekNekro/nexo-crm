import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { validTemporaryAccess } from '../src/domain/temporary-access.ts';
import { visibleData, applyAuthorized } from '../src/application/access.ts';
const d = {
  ...seed(),
  workers: [{ id: 'ext', name: 'Externo', kind: 'Subcontrata', company: 'Sub', rate: 20 }],
  works: ['w1', 'w2'].map((id) => ({
    id,
    name: id,
    companyId: 'c1',
    orderId: '',
    address: '',
    owner: 'Alex',
    responsible: 'Alex',
    start: '',
    end: '',
    status: 'En curso',
    progress: 0,
    notes: '',
    workerIds: ['ext'],
  })),
};
const u = {
  id: 'u',
  username: 'external',
  role: 'worker',
  profile: 'operario:ext',
  mustChange: false,
  external: true,
  workScope: ['w1'],
};
test('temporal exige fecha vigente, subcontrata y obras asignadas explícitas', () => {
  assert.equal(validTemporaryAccess(d, u.profile, '2026-11-11', ['w1'], '2026-11-11'), true);
  for (const [end, scope] of [
    ['2026-11-10', ['w1']],
    ['2026-02-30', ['w1']],
    ['2026-12-01', []],
    ['2026-12-01', ['other']],
    ['2026-12-01', ['w1', 'w1']],
  ])
    assert.equal(validTemporaryAccess(d, u.profile, end, scope, '2026-11-11'), false);
  assert.equal(
    validTemporaryAccess(
      { ...d, workers: [{ ...d.workers[0], kind: 'Propio' }] },
      u.profile,
      '2026-12-01',
      ['w1'],
      '2026-11-11',
    ),
    false,
  );
});
test('cuenta externa no ve ni escribe otra obra aunque su operario también esté asignado', () => {
  const v = visibleData(d, u);
  assert.deepEqual(
    v.works.map((w) => w.id),
    ['w1'],
  );
  v.laborReports = [
    {
      id: 'r',
      workId: 'w2',
      workerId: 'ext',
      date: '2026-11-11',
      hours: 1,
      summary: 'Intento',
      incidents: '',
      photos: [],
      status: 'Pendiente',
      rate: null,
      history: [],
      createdAt: '',
      updatedAt: '',
    },
  ];
  assert.throws(() => applyAuthorized(d, v, u, '2026-11-11T12:00:00Z'), /no está autorizada/);
  assert.equal(visibleData(d, { ...u, workScope: [] }).works.length, 0);
});
