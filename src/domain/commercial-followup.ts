import type { Company, Contact, Deal, Task } from './model';
export const businessToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const dayNumber = (s: string) => Date.parse(s.slice(0, 10) + 'T12:00:00Z') / 86400000;
export function quoteState(d: Deal, today = businessToday()) {
  if (d.acceptedRevisionId || d.stage === 'Ganado') return 'Aceptado';
  if (d.stage === 'Perdido') return 'Perdido';
  const v = d.versions.at(-1);
  if (!v) return 'Borrador';
  if (dayNumber(today) - dayNumber(v.date) > Number(v.snapshot?.brand?.quoteValidityDays || 30))
    return 'Caducado';
  return v.sentAt ? 'Enviado' : 'Borrador';
}
export function dealAlerts(d: Deal, tasks: Task[], today = businessToday()) {
  if (['Ganado', 'Perdido'].includes(d.stage)) return [];
  const alerts: string[] = [];
  if (!tasks.some((t) => t.dealId === d.id && !t.done && !t.cancelled))
    alerts.push('Sin siguiente actividad');
  if (d.updatedAt && dayNumber(today) - dayNumber(d.updatedAt) >= 14)
    alerts.push('14 días o más sin movimiento');
  return alerts;
}
export function possibleDuplicates(
  rows: (Company | Contact)[],
  value: { id?: string; taxId?: string; email?: string; phone?: string },
) {
  const tax = (s = '') => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const mail = (s = '') => s.trim().toLowerCase();
  const phone = (s = '') => {
    let n = s.replace(/\D/g, '');
    if (n.startsWith('0034')) n = n.slice(4);
    if (n.length === 11 && n.startsWith('34')) n = n.slice(2);
    return n;
  };
  return rows
    .filter((r) => r.id !== value.id)
    .flatMap((r) => {
      const reasons = [];
      if (tax(value.taxId) && tax(value.taxId) === tax('taxId' in r ? r.taxId : undefined))
        reasons.push('CIF');
      if (mail(value.email) && mail(value.email) === mail(r.email)) reasons.push('correo');
      if (phone(value.phone).length >= 7 && phone(value.phone) === phone(r.phone))
        reasons.push('teléfono');
      return reasons.length ? [{ id: r.id, name: r.name, reasons }] : [];
    });
}
export function validSchedule(t: { time?: string; durationMinutes?: number | null }) {
  return (
    (!t.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)) &&
    (t.durationMinutes == null ||
      (!!t.time &&
        Number.isInteger(t.durationMinutes) &&
        t.durationMinutes > 0 &&
        t.durationMinutes <= 1440))
  );
}
export function activitySchedule(t: Task) {
  return t.time
    ? t.time + (t.durationMinutes ? ' · ' + t.durationMinutes + ' min' : '')
    : 'Sin hora';
}

/** Display the accepted document, otherwise the latest issued revision, otherwise the draft. */
export function displayedQuote(d: Deal) {
  const revision = d.versions.find((v) => v.id === d.acceptedRevisionId) || d.versions.at(-1);
  return {
    revision,
    lines: revision?.lines || d.lines,
    label: d.acceptedRevisionId
      ? 'Presupuesto aceptado'
      : revision
        ? 'Última revisión'
        : 'Borrador actual',
  };
}
