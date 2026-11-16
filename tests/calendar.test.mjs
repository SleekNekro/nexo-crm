import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, shiftMonth } from '../src/presentation/utils/calendar.ts';
test('calendar includes leap day and complete Monday-first weeks', () => {
  const days = monthDays('2028-02');
  assert.ok(days.includes('2028-02-29'));
  assert.equal(days.length % 7, 0);
  assert.equal(new Date(days[0] + 'T12:00:00Z').getUTCDay(), 1);
  assert.equal(new Date(days.at(-1) + 'T12:00:00Z').getUTCDay(), 0);
  assert.equal(new Set(days).size, days.length);
});
test('month navigation crosses year boundaries without skipping days', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthDays('2026-03').filter((d) => d.startsWith('2026-03')).length, 31);
});
