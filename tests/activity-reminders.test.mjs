import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reminderWindow,
  needsReminder,
  reminderMessage,
} from '../src/domain/activity-reminders.ts';
const task = {
  id: 't1',
  dealId: 'd1',
  title: 'Llamar a Ana',
  owner: 'Ana',
  due: '2026-11-18',
  done: false,
  kind: 'Llamada',
};
test('Aviso el día anterior a partir de las 9 de Madrid, con horario de verano', () => {
  assert.equal(needsReminder(task, new Date('2026-11-17T07:59:59Z')), false);
  assert.equal(needsReminder(task, new Date('2026-11-17T08:00:00Z')), true);
  assert.equal(needsReminder(task, new Date('2026-11-18T08:00:00Z')), false);
  assert.equal(reminderWindow(new Date('2026-07-17T06:59:00Z')).ready, false);
  assert.equal(reminderWindow(new Date('2026-07-17T07:00:00Z')).ready, true);
  assert.equal(reminderWindow(new Date('2026-12-31T08:00:00Z')).tomorrow, '2027-01-01');
});
test('Las actividades completadas, canceladas y de otra fecha no se avisan', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  for (const change of [
    { done: true },
    { cancelled: 'Anulada' },
    { due: '2026-11-19' },
    { due: '2026-11-17' },
  ])
    assert.equal(needsReminder({ ...task, ...change }, now), false);
});
test('El asunto identifica el recordatorio y el enlace lleva al trato sin cabeceras inyectadas', () => {
  const mail = reminderMessage(
    { ...task, title: 'Llamar\r\nAna', time: '10:30' },
    'Presupuesto A',
    'Empresa A',
    'http://localhost:8180',
  );
  assert.match(mail.subject, /^\[Recordatorio\]/);
  assert.ok(!mail.subject.includes('\n'));
  assert.match(mail.text, /10:30/);
  assert.match(mail.text, /deal=d1/);
  assert.match(mail.text, /Empresa A/);
});
