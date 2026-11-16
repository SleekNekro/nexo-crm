import test from 'node:test';
import assert from 'node:assert/strict';
import { workAuditChanges } from '../src/application/work-audit.ts';
const initial = {
  works: [{ id: 'w', supervision: [{ id: 's', hours: 2, rate: 30 }] }],
  workExpenses: [{ id: 'e', workId: 'w', amount: 100, status: 'Pendiente' }],
};
test('Audit requires a reason for corrections, preserves before/after and ignores no-op', () => {
  assert.deepEqual(workAuditChanges(initial, structuredClone(initial)), []);
  const next = structuredClone(initial);
  next.works[0].supervision[0].hours = 3;
  assert.throws(() => workAuditChanges(initial, next), /motivo/);
  next.works[0].supervision[0].changeReason = 'Corregir visita';
  const [event] = workAuditChanges(initial, next);
  assert.equal(event.before.hours, 2);
  assert.equal(event.after.hours, 3);
  assert.equal(event.reason, 'Corregir visita');
  assert.equal(event.after.changeReason, undefined);
});
test('Deleted supervision and expense confirmations remain auditable', () => {
  const next = structuredClone(initial);
  next.works[0].supervision = [];
  next.works[0].changeReason = 'Registro duplicado';
  next.workExpenses[0].status = 'Confirmado';
  next.workExpenses[0].changeReason = 'Ticket comprobado';
  const events = workAuditChanges(initial, next);
  assert.equal(events.length, 2);
  assert.equal(events[0].action, 'Eliminación');
  assert.equal(events[0].before.rate, 30);
  assert.equal(events[1].reason, 'Ticket comprobado');
});
