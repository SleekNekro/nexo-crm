import type { Data, Work } from './model';
export function plannedFinish(start: string, days: number | null | undefined): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(days) || !days || days < 0) return '';
  const date = new Date(start + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return '';
  date.setUTCDate(date.getUTCDate() + Math.ceil(days) - 1);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
export function manualDate(w: Work, key: 'actualStart' | 'actualEnd'): boolean {
  return w[(key + 'Manual') as 'actualStartManual' | 'actualEndManual'] ?? !!w[key];
}
export function reconcileWorkDates(before: Data, input: Data, today: string): Data {
  const next = structuredClone(input);
  for (const w of next.works || []) {
    const old = before.works?.find((x) => x.id === w.id);
    if (!old || w.start !== old.start || w.plannedDays !== old.plannedDays)
      w.end = plannedFinish(w.start, w.plannedDays);
    // Dates entered before automation remain explicit corrections; never invent historic dates.
    w.actualStartManual = w.actualStartManual ?? !!w.actualStart;
    w.actualEndManual = w.actualEndManual ?? !!w.actualEnd;
    if (!w.actualStartManual)
      w.actualStart =
        (next.laborReports || [])
          .filter((r) => r.workId === w.id && r.status === 'Confirmado')
          .map((r) => r.date)
          .sort()[0] || '';
    if (w.status !== 'Finalizada' && old?.status === 'Finalizada') {
      w.actualEnd = '';
      w.actualEndManual = false;
    } else if (!w.actualEndManual) {
      w.actualEnd =
        w.status === 'Finalizada'
          ? old?.status !== 'Finalizada'
            ? today
            : old.actualEnd || ''
          : '';
    }
  }
  return next;
}
