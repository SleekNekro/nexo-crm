import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { recordId } from '../src/presentation/utils/record-id.ts';
test('record identifiers work on local HTTP without randomUUID', () => {
  const source = { getRandomValues: (a) => webcrypto.getRandomValues(a) };
  const ids = Array.from({ length: 1000 }, () => recordId(source));
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids)
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('uses native UUID when available', () =>
  assert.equal(recordId({ randomUUID: () => 'native-id' }), 'native-id'));
