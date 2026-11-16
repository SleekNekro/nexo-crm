import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWorkAccounts } from '../src/infrastructure/work-assignments.ts';
const db = {
  query: async () => ({
    rows: [{ id: 'u', profile: 'new.sales', name: 'Nueva comercial', active: true }],
  }),
};
test('Work assignment resolves stable account ids and responsible display name', async () => {
  const next = {
    works: [
      {
        id: 'w',
        owner: 'new.sales',
        reviewer: 'new.sales',
        responsible: 'Old',
        ownerUserId: 'forged',
      },
    ],
  };
  await bindWorkAccounts(db, { works: [] }, next);
  assert.equal(next.works[0].ownerUserId, 'u');
  assert.equal(next.works[0].reviewerUserId, 'u');
  assert.equal(next.works[0].responsible, 'Nueva comercial');
});
test('Legacy assignments are retained explicitly but new unknown accounts are rejected', async () => {
  const old = { works: [{ id: 'w', owner: 'Legacy' }] },
    next = structuredClone(old);
  await bindWorkAccounts(db, old, next);
  assert.equal(next.works[0].owner, 'Legacy');
  assert.equal(next.works[0].ownerUserId, undefined);
  await assert.rejects(
    () => bindWorkAccounts(db, { works: [] }, { works: [{ id: 'new', owner: 'Unknown' }] }),
    /cuenta real/,
  );
});

test('Default reviewer stays bound across saves; legacy free text is not silently replaced', async () => {
  const first = { works: [{ id: 'new', owner: 'new.sales', responsible: 'New' }] };
  await bindWorkAccounts(db, { works: [] }, first);
  assert.equal(first.works[0].reviewer, 'new.sales');
  const next = structuredClone(first);
  await bindWorkAccounts(db, first, next);
  assert.equal(next.works[0].reviewerUserId, 'u');
  const legacy = { works: [{ id: 'old', owner: 'new.sales', responsible: 'Encargado antiguo' }] };
  const migrated = structuredClone(legacy);
  await bindWorkAccounts(db, legacy, migrated);
  assert.equal(migrated.works[0].responsible, 'Encargado antiguo');
  assert.equal(migrated.works[0].reviewerUserId, undefined);
});
