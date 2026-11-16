import type { Task } from './model';
export const activityPriorities = ['Alta', 'Media', 'Baja'] as const;
export type ActivityPriority = (typeof activityPriorities)[number];
export const activityKinds = [
  'Tarea',
  'Presupuesto',
  'Seguimiento',
  'Llamada',
  'Visita',
  'Reunión',
] as const;
export function activityPriority(
  task: Pick<Task, 'kind' | 'priority' | 'quoteRevisionId'>,
): ActivityPriority {
  if (task.priority) return task.priority;
  if (task.quoteRevisionId) return 'Media';
  if (task.kind === 'Presupuesto') return 'Alta';
  return task.kind === 'Tarea' ? 'Baja' : 'Media';
}
export function compareActivities(a: Task, b: Task) {
  return (
    a.due.localeCompare(b.due) ||
    activityPriorities.indexOf(activityPriority(a)) -
      activityPriorities.indexOf(activityPriority(b)) ||
    (a.time || '99:99').localeCompare(b.time || '99:99') ||
    a.title.localeCompare(b.title, 'es') ||
    a.id.localeCompare(b.id)
  );
}
export function validActivityPriority(value: unknown) {
  return value === undefined || activityPriorities.includes(value as ActivityPriority);
}
