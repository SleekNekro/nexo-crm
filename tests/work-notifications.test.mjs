import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingWorkReports } from '../src/domain/work-notifications.ts';
test('Counts only pending reports reviewable by the profile, grouped by work', () => {
  const data = {
    works: [
      { id: 'a', owner: 'Alex' },
      { id: 'b', owner: 'Ana', reviewer: 'Comercial1' },
    ],
    laborReports: [
      { workId: 'a', status: 'Pendiente' },
      { workId: 'a', status: 'Pendiente' },
      { workId: 'a', status: 'Confirmado' },
      { workId: 'a', status: 'Devuelto' },
      { workId: 'a', status: 'Borrador' },
      { workId: 'b', status: 'Pendiente' },
      { workId: 'unknown', status: 'Pendiente' },
    ],
  };
  assert.deepEqual(pendingWorkReports(data, 'Dirección'), { a: 2, b: 1 });
  assert.deepEqual(pendingWorkReports(data, 'Alex'), { a: 2 });
  assert.deepEqual(pendingWorkReports(data, 'Ana'), {});
  assert.deepEqual(pendingWorkReports(data, 'Comercial1'), { b: 1 });
  data.laborReports[0].status = 'Confirmado';
  data.laborReports[1].status = 'Devuelto';
  assert.deepEqual(pendingWorkReports(data, 'Alex'), {});
});
