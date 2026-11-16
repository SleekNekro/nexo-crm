import type { Data, Work } from './model';
import { subtotal } from './model.ts';
export const expenseKinds = ['Materiales', 'Dietas', 'Alojamientos', 'Gasolina', 'Otros'] as const;
const day = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const optionalNumber = (n: unknown) =>
  n == null || (typeof n === 'number' && Number.isFinite(n) && n >= 0);
export function validWorkControl(w: Work): boolean {
  return (
    [w.actualStartManual, w.actualEndManual].every(
      (v) => v === undefined || typeof v === 'boolean',
    ) &&
    [w.areaM2, w.budgetAmount, w.plannedDays].every(optionalNumber) &&
    (!w.actualStart || day(w.actualStart)) &&
    (!w.actualEnd || day(w.actualEnd)) &&
    (!w.actualStart || !w.actualEnd || w.actualEnd >= w.actualStart) &&
    (w.updatedAt === undefined ||
      (typeof w.updatedAt === 'string' && Number.isFinite(Date.parse(w.updatedAt)))) &&
    (w.supervision === undefined ||
      (Array.isArray(w.supervision) &&
        w.supervision.length <= 5000 &&
        new Set(w.supervision.map((e) => e.id)).size === w.supervision.length &&
        w.supervision.every(
          (e) =>
            typeof e.id === 'string' &&
            !!e.id &&
            day(e.date) &&
            typeof e.person === 'string' &&
            !!e.person.trim() &&
            e.person.length <= 150 &&
            Number.isFinite(e.hours) &&
            e.hours > 0 &&
            e.hours <= 24 &&
            (e.rate === null ||
              (typeof e.rate === 'number' && Number.isFinite(e.rate) && e.rate >= 0)) &&
            typeof e.notes === 'string' &&
            e.notes.length <= 2000 &&
            w
              .supervision!.filter(
                (x) =>
                  x.date === e.date &&
                  x.person.trim().toLocaleLowerCase() === e.person.trim().toLocaleLowerCase(),
              )
              .reduce((s, x) => s + x.hours, 0) <= 24,
        )))
  );
}
export function workBudget(data: Data, work: Work): number | null {
  const order = data.orders.find((o) => o.id === work.orderId);
  return order ? subtotal(order.lines) : (work.budgetAmount ?? null);
}
