import type { Task } from './model';
export function reminderWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const today = `${v.year}-${v.month}-${v.day}`;
  const next = new Date(today + 'T12:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return { ready: Number(v.hour) >= 9, today, tomorrow: next.toISOString().slice(0, 10) };
}
export function needsReminder(task: Task, now = new Date()) {
  const window = reminderWindow(now);
  return window.ready && !task.done && !task.cancelled && task.due === window.tomorrow;
}
export function reminderMessage(
  task: Task,
  dealTitle: string,
  companyName: string,
  publicUrl: string,
) {
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  const link = new URL('/', publicUrl);
  link.hash = new URLSearchParams({
    view: 'Actividades',
    deal: task.dealId,
    tab: 'Actividades',
  }).toString();
  return {
    subject: '[Recordatorio] ' + oneLine(task.title).slice(0, 160) + ' · mañana',
    text: [
      'Tienes una actividad prevista para mañana:',
      '',
      oneLine(task.title),
      'Fecha: ' + task.due + (task.time ? ' a las ' + task.time : ''),
      'Empresa: ' + companyName,
      'Trato: ' + dealTitle,
      'Responsable: ' + task.owner,
      '',
      'Abrir en el CRM: ' + link.toString(),
      '',
      'Puedes desactivar estos avisos en Mi cuenta → Configurar mi correo.',
    ].join('\n'),
  };
}
