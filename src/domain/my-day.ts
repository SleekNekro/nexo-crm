import { compareActivities } from './activity-priority.ts';
import { canReview } from './labor.ts';
import type { Data } from './model';
export function myDay(data: Data, profile: string, today: string) {
  const allowed = (owner: string) => profile === 'Dirección' || owner === profile;
  const tasks = data.tasks
    .filter((t) => allowed(t.owner) && !t.done && !t.cancelled && t.due <= today)
    .sort(compareActivities);
  const works = (data.works || []).filter((w) => canReview(w, profile));
  const reports = (data.laborReports || [])
    .filter((r) => r.status === 'Pendiente' && works.some((w) => w.id === r.workId))
    .sort((a, b) => a.date.localeCompare(b.date));
  const quotes = data.deals.filter(
    (d) =>
      allowed(d.owner) &&
      !['Ganado', 'Perdido'].includes(d.stage) &&
      d.versions.length &&
      !data.tasks.some((t) => t.dealId === d.id && !t.done && !t.cancelled),
  );
  return { tasks, works, reports, quotes, late: tasks.filter((t) => t.due < today).length };
}
