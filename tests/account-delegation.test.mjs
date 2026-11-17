import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageAccount, availableViews, availableActions } from '../src/domain/permissions.ts';
const admin = { role: 'admin' };
const limited = { role: 'admin', permissions: { views: ['Equipo'], actions: ['accounts'] } };
test('Limited administrator cannot grant or take control of stronger accounts', () => {
  for (const role of ['admin', 'developer', 'commercial', 'worker'])
    assert.equal(canManageAccount(limited, { role }), false);
  assert.equal(canManageAccount(admin, { role: 'admin' }), false);
  assert.equal(canManageAccount(admin, { role: 'worker', global_role: 'developer' }), false);
  assert.equal(canManageAccount(admin, { role: 'worker', global_role: 'admin' }), false);
});
test('Full administrator can manage ordinary accounts; developer manages all roles', () => {
  for (const role of ['commercial', 'worker'])
    assert.equal(canManageAccount(admin, { role }), true);
  for (const role of ['admin', 'developer', 'commercial', 'worker'])
    assert.equal(canManageAccount({ ...limited, platformDeveloper: true }, { role }), true);
});
test('Delegation checks effective views AND actions, not only role', () => {
  const actor = {
    ...admin,
    permissions: {
      views: availableViews('admin'),
      actions: availableActions('admin').filter((a) => a !== 'deals'),
    },
  };
  assert.equal(canManageAccount(actor, { role: 'commercial' }), false);
  assert.equal(
    canManageAccount(actor, {
      role: 'commercial',
      permissions: { views: ['Empresas'], actions: ['companies'] },
    }),
    true,
  );
  assert.equal(canManageAccount({ role: 'commercial' }, { role: 'worker' }), false);
});
