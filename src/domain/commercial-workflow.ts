import type { Data, Deal, Task } from './model';
import { completeTask } from './actions.ts';
import { businessToday } from './commercial-followup.ts';
import { compareActivities } from './activity-priority.ts';
export function nextCommercialStep(deal: Deal, tasks: Task[], today = businessToday()) {
  const task = tasks
    .filter((t) => t.dealId === deal.id && !t.done && !t.cancelled)
    .sort(compareActivities)[0];
  if (['Ganado', 'Perdido'].includes(deal.stage))
    return { kind: 'open' as const, label: 'Ver trato cerrado' };
  if (task && task.due <= today)
    return { kind: 'task' as const, label: 'Realizar actividad', task };
  if (!deal.lines.length && !deal.versions.length)
    return { kind: 'quote' as const, label: 'Preparar presupuesto' };
  if (!deal.versions.length) return { kind: 'quote' as const, label: 'Revisar y abrir PDF' };
  const latest = deal.versions.at(-1)!;
  if (
    JSON.stringify(latest.lines) !== JSON.stringify(deal.lines) ||
    (latest.snapshot && latest.snapshot.title !== deal.title)
  )
    return { kind: 'quote' as const, label: 'Revisar cambios del presupuesto' };
  if (!deal.versions.at(-1)?.sentAt) return { kind: 'quote' as const, label: 'Registrar envío' };
  return task
    ? { kind: 'task' as const, label: 'Ver seguimiento', task }
    : { kind: 'schedule' as const, label: 'Programar seguimiento' };
}
export function finishCommercialActivity(
  data: Data,
  id: string,
  result: string,
  next: { id: string; title: string; due: string } | undefined,
): Data {
  const task = data.tasks.find((t) => t.id === id);
  if (!task || task.done || task.cancelled)
    throw Error('Esta actividad ya no está pendiente. Actualiza la página.');
  if (result.length > 4000) throw Error('El resultado no puede superar 4000 caracteres.');
  const deal = data.deals.find((d) => d.id === task.dealId);
  if (next && (!deal || ['Ganado', 'Perdido'].includes(deal.stage)))
    throw Error('El trato está cerrado. No se puede programar un seguimiento comercial.');
  if (
    next &&
    (!next.title.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(next.due) ||
      !Number.isFinite(Date.parse(next.due)) ||
      new Date(next.due).toISOString().slice(0, 10) !== next.due ||
      next.due < businessToday() ||
      data.tasks.some((t) => t.id === next.id))
  )
    throw Error('Indica la siguiente acción y una fecha de hoy en adelante.');
  const updated = completeTask(data, id, true);
  updated.tasks.find((t) => t.id === id)!.result = result.trim();
  if (next)
    updated.tasks.push({
      id: next.id,
      dealId: task.dealId,
      owner: task.owner,
      title: next.title.trim(),
      due: next.due,
      kind: 'Seguimiento',
      ...(task.quoteRevisionId ? { quoteRevisionId: task.quoteRevisionId } : {}),
      done: false,
    });
  return updated;
}
export function daysFrom(day: string, count: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
