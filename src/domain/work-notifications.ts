import type { Data } from './model';
import { canReview } from './labor.ts';
export function pendingWorkReports(data: Data, profile: string): Record<string, number> {
  const allowed = new Set((data.works || []).filter((w) => canReview(w, profile)).map((w) => w.id));
  const counts: Record<string, number> = {};
  for (const report of data.laborReports || [])
    if (report.status === 'Pendiente' && allowed.has(report.workId))
      counts[report.workId] = (counts[report.workId] || 0) + 1;
  return counts;
}
