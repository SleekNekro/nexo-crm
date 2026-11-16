import { expenseKinds } from './work-control.ts';
import type { Data, LaborReport, Work, Worker, WorkExpense } from './model';
import { validPhotoSource } from './photo-source.ts';
import { validateMeasurements, workProgress } from './progress.ts';
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const canReview = (work: Work, actor: string) =>
  actor === 'Dirección' || actor === (work.reviewer || work.owner);
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function saveWorker(data: Data, worker: Worker, actor: string): Data {
  if (actor !== 'Dirección') throw Error('Solo Dirección puede configurar operarios y tarifas');
  if (
    !worker.name.trim() ||
    !['Propio', 'Subcontrata'].includes(worker.kind) ||
    (worker.rate !== null && (!Number.isFinite(worker.rate) || worker.rate < 0))
  )
    throw Error('Introduce un nombre y una tarifa válida o déjala sin definir');
  const n = structuredClone(data);
  n.workers ??= [];
  const i = n.workers.findIndex((w) => w.id === worker.id);
  if (i < 0) n.workers.push(worker);
  else n.workers[i] = worker;
  return n;
}
export function saveLabor(
  data: Data,
  input: LaborReport,
  workerId: string,
  submit: boolean,
  now: string,
): Data {
  const n = structuredClone(data),
    worker = n.workers?.find((w) => w.id === workerId),
    work = n.works?.find((w) => w.id === input.workId),
    old = n.laborReports?.find((r) => r.id === input.id);
  if (
    !worker ||
    worker.archived ||
    input.workerId !== workerId ||
    !work?.workerIds?.includes(workerId)
  )
    throw Error('El operario no está asignado a esta obra');
  if (
    old &&
    (old.workerId !== workerId ||
      old.workId !== input.workId ||
      !['Borrador', 'Devuelto'].includes(old.status))
  )
    throw Error('Solo puedes editar tus borradores y partes devueltos');
  if (
    !validDate(input.date) ||
    input.date >
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(now)) ||
    !Number.isFinite(input.hours) ||
    input.hours <= 0 ||
    input.hours > 24 ||
    !input.summary.trim()
  )
    throw Error('Revisa fecha, horas (más de 0 y hasta 24) y trabajos realizados');
  validateMeasurements(n, input);
  const daily = (n.laborReports || [])
    .filter(
      (r) =>
        r.id !== input.id &&
        r.workerId === workerId &&
        r.date === input.date &&
        r.status !== 'Devuelto',
    )
    .reduce((s, r) => s + r.hours, 0);
  if (daily + input.hours > 24)
    throw Error('Las horas de este día entre todas las obras no pueden superar 24');
  if (input.photos.length > 8 || input.photos.some((p) => !validPhotoSource(p.src)))
    throw Error('Revisa las fotos del parte');
  const report: LaborReport = {
    ...input,
    rate: null,
    status: submit ? 'Pendiente' : 'Borrador',
    createdAt: old?.createdAt || now,
    updatedAt: now,
    history: [
      ...(old?.history || []),
      {
        date: now,
        actor: worker.name,
        action: submit ? 'Enviado' : 'Borrador guardado',
        reason: '',
      },
    ],
  };
  n.laborReports ??= [];
  const i = n.laborReports.findIndex((r) => r.id === report.id);
  if (i < 0) n.laborReports.push(report);
  else n.laborReports[i] = report;
  return n;
}
export function reviewLabor(
  data: Data,
  id: string,
  action: 'Confirmar' | 'Devolver' | 'Reabrir' | 'Valorar',
  actor: string,
  reason: string,
  now: string,
): Data {
  const n = structuredClone(data),
    r = n.laborReports?.find((r) => r.id === id),
    w = n.works?.find((w) => w.id === r?.workId);
  if (!r || !w || !canReview(w, actor))
    throw Error('Solo el responsable de esta obra o Dirección pueden revisar el parte');
  if (action === 'Confirmar' || action === 'Devolver') {
    if (r.status !== 'Pendiente') throw Error('Este parte no está pendiente de revisión');
  }
  if (action === 'Reabrir' && r.status !== 'Confirmado')
    throw Error('Solo se pueden reabrir partes confirmados');
  if (['Devolver', 'Reabrir'].includes(action) && !reason.trim())
    throw Error('Indica el motivo para el operario');
  if (action === 'Confirmar') {
    r.status = 'Confirmado';
    r.rate = n.workers?.find((x) => x.id === r.workerId)?.rate ?? null;
  }
  if (action === 'Devolver' || action === 'Reabrir') {
    r.status = 'Devuelto';
    r.rate = null;
  }
  if (action === 'Valorar') {
    if (r.status !== 'Confirmado' || r.rate !== null)
      throw Error('Este parte no está pendiente de valorar');
    const rate = n.workers?.find((x) => x.id === r.workerId)?.rate;
    if (rate === null || rate === undefined)
      throw Error('Configura primero el coste por hora del operario');
    r.rate = rate;
  }
  if (
    action === 'Confirmar' &&
    workProgress(n, w.id).items.some((i) => i.executed > i.plannedQty + 0.00001)
  )
    throw Error(
      'La ejecución supera lo previsto. Revisa las mediciones por zona o actualiza la planificación antes de confirmar.',
    );
  r.updatedAt = now;
  r.history.push({ date: now, actor, action, reason: reason.trim() });
  return n;
}
export function saveExpense(data: Data, expense: WorkExpense, actor: string): Data {
  const w = data.works?.find((w) => w.id === expense.workId);
  if (!w || !canReview(w, actor))
    throw Error('Solo el responsable o Dirección pueden registrar gastos');
  if (
    !expenseKinds.includes(expense.kind) ||
    !validDate(expense.date) ||
    !expense.concept.trim() ||
    !Number.isFinite(expense.amount) ||
    expense.amount < 0
  )
    throw Error('Revisa el concepto, fecha e importe');
  const n = structuredClone(data);
  n.workExpenses ??= [];
  const i = n.workExpenses.findIndex((e) => e.id === expense.id);
  if (i < 0) n.workExpenses.push(expense);
  else n.workExpenses[i] = expense;
  return n;
}
export function workCosts(data: Data, workId: string) {
  const reports = (data.laborReports || []).filter((r) => r.workId === workId),
    confirmed = reports.filter((r) => r.status === 'Confirmado'),
    pending = reports.filter((r) => r.status === 'Pendiente'),
    expenses = (data.workExpenses || []).filter((e) => e.workId === workId);
  const labor = round(
    confirmed.reduce((s, r) => s + (r.rate === null ? 0 : round(r.hours * r.rate)), 0),
  );
  const supervision = data.works?.find((w) => w.id === workId)?.supervision || [];
  const supervisionHours = supervision.reduce((s, e) => s + e.hours, 0);
  const supervisionMissingHours = supervision
    .filter((e) => e.rate === null)
    .reduce((s, e) => s + e.hours, 0);
  const supervisionCost = round(
    supervision.reduce((s, e) => s + (e.rate === null ? 0 : round(e.hours * e.rate)), 0),
  );
  const expenseTotal = (kind: string) =>
    round(
      expenses
        .filter((e) => e.status === 'Confirmado' && e.kind === kind)
        .reduce((s, e) => s + e.amount, 0),
    );
  const diets = expenseTotal('Dietas'),
    lodging = expenseTotal('Alojamientos'),
    fuel = expenseTotal('Gasolina');
  const missingHours = confirmed.filter((r) => r.rate === null).reduce((s, r) => s + r.hours, 0);
  const materials = round(
      expenses
        .filter((e) => e.status === 'Confirmado' && e.kind === 'Materiales')
        .reduce((s, e) => s + e.amount, 0),
    ),
    other = round(
      expenses
        .filter((e) => e.status === 'Confirmado' && e.kind === 'Otros')
        .reduce((s, e) => s + e.amount, 0),
    );
  return {
    labor,
    materials,
    other,
    diets,
    lodging,
    fuel,
    supervisionHours,
    supervisionMissingHours,
    supervisionCost,
    total: round(labor + materials + other + diets + lodging + fuel + supervisionCost),
    confirmedHours: confirmed.reduce((s, r) => s + r.hours, 0),
    pendingHours: pending.reduce((s, r) => s + r.hours, 0),
    missingHours,
    pendingExpenses: round(
      expenses.filter((e) => e.status === 'Pendiente').reduce((s, e) => s + e.amount, 0),
    ),
    legacyHours: (data.siteReports || [])
      .filter((r) => r.workId === workId)
      .reduce((s, r) => s + r.crew.reduce((n, c) => n + c.people * c.hours, 0), 0),
  };
}

export function compareWorkCost(data: Data, work: Work) {
  const costs = workCosts(data, work.id),
    planned = work.plannedCost ?? null;
  return {
    planned,
    actual: costs.total,
    remaining: planned === null ? null : round(planned - costs.total),
    exceeded: planned !== null && costs.total > planned,
    percent: planned === null || planned === 0 ? null : round((costs.total / planned) * 100),
    incomplete: !!(
      costs.pendingHours ||
      costs.missingHours ||
      costs.supervisionMissingHours ||
      costs.pendingExpenses ||
      costs.legacyHours
    ),
  };
}

export function removeWorker(data: Data, id: string, actor: string): Data {
  if (actor !== 'Dirección') throw Error('Solo Dirección puede eliminar personas del equipo');
  if (!data.workers?.some((w) => w.id === id)) throw Error('Persona no encontrada');
  if (data.laborReports?.some((r) => r.workerId === id))
    throw Error(
      'Esta persona tiene partes registrados. Conserva su ficha y desactiva su cuenta para mantener las horas y los costes históricos.',
    );
  const next = structuredClone(data);
  next.workers = next.workers!.filter((w) => w.id !== id);
  for (const work of next.works || [])
    if (work.workerIds?.includes(id)) work.workerIds = work.workerIds.filter((x) => x !== id);
  return next;
}

export function archiveWorker(data: Data, id: string, archived: boolean, actor: string): Data {
  if (actor !== 'Dirección') throw Error('Solo Dirección puede archivar personas');
  const next = structuredClone(data),
    worker = next.workers?.find((w) => w.id === id);
  if (!worker) throw Error('Persona no encontrada');
  worker.archived = archived;
  return next;
}
