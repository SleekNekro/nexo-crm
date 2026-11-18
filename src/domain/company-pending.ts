import type { Deal, Task } from './model';
import { businessToday, quoteState } from './commercial-followup.ts';
/** Count opportunities, not revisions; callers supply only visible deals. */
export function companyPending(deals: Deal[], tasks: Task[], today = businessToday()) {
  const ids = new Set(deals.map((d) => d.id));
  const pending = tasks.filter((t) => ids.has(t.dealId) && !t.done && !t.cancelled);
  const states = deals
    .filter((d) => d.lines.length || d.versions.length)
    .map((d) => quoteState(d, today));
  const drafts = states.filter((s) => s === 'Borrador').length,
    waiting = states.filter((s) => s === 'Enviado').length,
    expired = states.filter((s) => s === 'Caducado').length;
  return {
    activities: pending.length,
    overdue: pending.filter((t) => !!t.due && t.due < today).length,
    today: pending.filter((t) => t.due === today).length,
    quotes: drafts + waiting + expired,
    drafts,
    waiting,
    expired,
  };
}
