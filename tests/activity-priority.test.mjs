import test from 'node:test';
import assert from 'node:assert/strict';
import { activityPriority, compareActivities } from '../src/domain/activity-priority.ts';
import { seed } from '../src/domain/model.ts';
import { editActivityData, issueQuote, markQuoteSent } from '../src/domain/actions.ts';
import { validateBusinessChange } from '../src/application/business-rules.ts';
test('presupuestos alta, seguimientos media y tareas generales baja', () => {
  assert.equal(activityPriority({ kind: 'Presupuesto' }), 'Alta');
  for (const kind of ['Seguimiento', 'Llamada', 'Visita', 'Reunión', 'Recepción'])
    assert.equal(activityPriority({ kind }), 'Media');
  assert.equal(activityPriority({ kind: 'Tarea' }), 'Baja');
  assert.equal(activityPriority({ kind: 'Tarea', quoteRevisionId: 'revision' }), 'Media');
});
test('prioridad manual prevalece y se puede volver al modo automático', () => {
  const data = seed(),
    task = data.tasks.find((t) => t.kind !== 'Recepción');
  const changed = editActivityData(data, task.id, {
    title: task.title,
    due: task.due,
    kind: 'Presupuesto',
    priority: 'Baja',
  });
  assert.equal(activityPriority(changed.tasks.find((t) => t.id === task.id)), 'Baja');
  const automatic = editActivityData(changed, task.id, {
    title: task.title,
    due: task.due,
    kind: 'Presupuesto',
    priority: undefined,
  });
  assert.equal(activityPriority(automatic.tasks.find((t) => t.id === task.id)), 'Alta');
  assert.doesNotThrow(() => validateBusinessChange(data, automatic));
});
test('prioridades inválidas se rechazan en servidor', () => {
  const data = seed(),
    next = structuredClone(data);
  next.tasks[0].priority = 'Urgentísima';
  assert.throws(() => validateBusinessChange(data, next), /prioridad/);
});
test('orden conserva la fecha y prioriza alta antes que media y baja dentro del día', () => {
  const base = { title: 'Actividad', kind: 'Tarea', due: '2026-11-13' };
  const rows = [
    { ...base, id: 'low', priority: 'Baja' },
    { ...base, id: 'medium', priority: 'Media' },
    { ...base, id: 'high', priority: 'Alta' },
    { ...base, id: 'overdue', priority: 'Baja', due: '2026-11-12' },
  ];
  assert.deepEqual(
    rows.sort(compareActivities).map((t) => t.id),
    ['overdue', 'high', 'medium', 'low'],
  );
});
test('el seguimiento generado al enviar presupuesto es de prioridad media', () => {
  const data = issueQuote(seed(), 'd1', 'priority-quote', '2026-11-13');
  const sent = markQuoteSent(
    data,
    'd1',
    'priority-quote',
    '2026-11-13',
    '2026-11-16',
    () => 'priority-follow',
  );
  assert.equal(activityPriority(sent.tasks.find((t) => t.id === 'priority-follow')), 'Media');
});
