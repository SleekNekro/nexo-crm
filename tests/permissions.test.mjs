import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableViews,
  availableActions,
  canView,
  canAct,
  validPermissions,
} from '../src/domain/permissions.ts';
import { applyAuthorized, visibleData } from '../src/application/access.ts';
import { seed } from '../src/domain/model.ts';
const admin = {
  id: 'a',
  username: 'admin',
  role: 'admin',
  profile: 'Dirección',
  mustChange: false,
};
test('Existing roles retain defaults; explicit empty permissions deny access', () => {
  assert.ok(canView(admin, 'Equipo'));
  assert.ok(canAct(admin, 'accounts'));
  const limited = { ...admin, permissions: { views: [], actions: [] } };
  assert.equal(canView(limited, 'Equipo'), false);
  assert.equal(canAct(limited, 'companies'), false);
  assert.equal(canView({ ...limited, role: 'developer' }, 'Equipo'), true);
});
test('Custom permissions cannot exceed role scope and reject malformed input', () => {
  assert.equal(validPermissions({ views: ['Equipo'], actions: [] }, 'worker'), false);
  assert.equal(validPermissions({ views: ['Mi día'], actions: ['accounts'] }, 'commercial'), false);
  assert.equal(validPermissions({ views: [], actions: [], extra: true }, 'admin'), false);
  assert.equal(validPermissions({ views: ['Obras', 'Obras'], actions: [] }, 'admin'), false);
  assert.ok(
    validPermissions(
      { views: availableViews('worker'), actions: availableActions('worker') },
      'worker',
    ),
  );
});
test('Server rejects unauthorized writes while preserving read-only submissions', () => {
  const data = seed();
  const u = { ...admin, permissions: { views: ['Empresas'], actions: [] } };
  const input = visibleData(data, u);
  assert.deepEqual(applyAuthorized(data, input, u, '2026-11-12T12:00:00Z'), data);
  input.companies[0].name = 'Forbidden';
  assert.throws(() => applyAuthorized(data, input, u, '2026-11-12T12:00:00Z'), /permiso/);
  u.permissions.actions = ['companies'];
  assert.equal(
    applyAuthorized(data, input, u, '2026-11-12T12:00:00Z').companies[0].name,
    'Forbidden',
  );
});
