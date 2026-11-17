import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleData, applyAuthorized } from '../src/application/access.ts';
import { seed } from '../src/domain/model.ts';
const user = {
  id: 'u',
  username: 'u',
  role: 'admin',
  profile: 'Dirección',
  mustChange: false,
  permissions: { views: ['Equipo'], actions: ['accounts'] },
};
test('Equipo-only account receives no commercial data, works or financial records', () => {
  const d = seed(),
    v = visibleData(d, user);
  for (const key of [
    'companies',
    'contacts',
    'deals',
    'orders',
    'tasks',
    'notes',
    'works',
    'laborReports',
    'workExpenses',
  ])
    assert.deepEqual(v[key], []);
  assert.deepEqual(applyAuthorized(d, v, user, '2026-11-17'), d);
});
test('Quote denial removes lines, revisions, snapshots and acceptance metadata', () => {
  const d = seed();
  d.deals[0].versions = [
    {
      id: 'v',
      date: '2026-11-17',
      lines: d.deals[0].lines,
      snapshot: { client: d.companies[0], title: 'Secret', owner: 'x' },
    },
  ];
  const u = { ...user, permissions: { views: ['Tratos'], actions: ['deals'] } };
  const v = visibleData(d, u);
  assert.deepEqual(v.deals[0].versions, []);
  assert.deepEqual(v.deals[0].lines, []);
  v.deals[0].title = 'New title';
  const next = applyAuthorized(d, v, u, '2026-11-17');
  assert.deepEqual(next.deals[0].versions, d.deals[0].versions);
  assert.deepEqual(next.deals[0].lines, d.deals[0].lines);
  assert.equal(next.deals[0].title, 'New title');
  const bad = visibleData(d, u);
  bad.deals[0].lines = [{ description: 'hack', qty: 1, price: 1, discount: 0, tax: 21 }];
  assert.throws(() => applyAuthorized(d, bad, u, '2026-11-17'), /ocultos/);
  const removed = visibleData(d, u);
  removed.deals.shift();
  assert.throws(() => applyAuthorized(d, removed, u, '2026-11-17'), /oculta/);
});
test('Hidden entities cannot be written even with an action permission', () => {
  const d = seed(),
    u = { ...user, permissions: { views: ['Equipo'], actions: ['companies'] } },
    v = visibleData(d, u);
  v.companies.push(d.companies[0]);
  assert.throws(() => applyAuthorized(d, v, u, '2026-11-17'), /permiso/);
});
