import {
  activityKinds,
  validActivityPriority,
  type ActivityPriority,
} from './activity-priority.ts';
import { expenseKinds, validWorkControl } from './work-control.ts';
import type { Data, Deal, SiteReport, Work } from './model';
import { validPhotoSource } from './photo-source.ts';
import { importWorkItems, validProgressData } from './progress.ts';
export function changeStage(
  data: Data,
  id: string,
  stage: string,
  newId: () => string,
  date: string,
  reason?: string,
): Data {
  if (!['En preparación', 'Pendiente del cliente', 'Ganado', 'Perdido'].includes(stage))
    throw Error('Fase no válida');
  const n = structuredClone(data),
    d = n.deals.find((d) => d.id === id);
  if (!d) throw Error('Trato no encontrado');
  if (stage === 'Perdido' && !reason?.trim()) throw Error('Indica el motivo de pérdida');
  const revision = d.versions.find((v) => v.id === d.acceptedRevisionId),
    saleLines = revision?.lines || d.lines;
  if (
    stage === 'Ganado' &&
    d.versions.length &&
    !revision &&
    !n.orders.some((o) => o.dealId === id)
  )
    throw Error('Selecciona y acepta una revisión desde Presupuesto');
  if (stage === 'Ganado' && (!saleLines.length || !validLines(saleLines)))
    throw Error('Añade partidas válidas antes de ganar el trato');
  d.stage = stage;
  if (stage === 'Perdido') d.reason = reason?.trim();
  else delete d.reason;
  if (stage === 'Ganado' || stage === 'Perdido')
    n.tasks
      .filter((t) => t.dealId === id && t.kind !== 'Recepción' && !t.done && !t.cancelled)
      .forEach((t) => (t.cancelled = 'Cancelada por cierre: ' + stage));
  if (stage === 'Ganado' && !n.orders.some((o) => o.dealId === id)) {
    n.orders.push({
      id: newId(),
      dealId: id,
      date,
      status: 'Pendiente de revisión',
      ...(revision ? { revisionId: revision.id } : {}),
      lines: structuredClone(saleLines),
    });
    n.tasks.push({
      id: newId(),
      dealId: id,
      title: 'Confirmar recepción del pedido',
      due: date,
      owner: d.owner,
      done: false,
      kind: 'Recepción',
    });
  }
  return n;
}
export function issueQuote(data: Data, id: string, versionId: string, date: string): Data {
  const n = structuredClone(data),
    d = n.deals.find((d) => d.id === id);
  if (!d) throw Error('Trato no encontrado');
  if (['Ganado', 'Perdido'].includes(d.stage))
    throw Error('Reabre el trato para emitir una revisión');
  if (!d.lines.length) throw Error('Añade al menos una línea al presupuesto');
  const client = n.companies.find((c) => c.id === d.companyId),
    contact = n.contacts.find((c) => c.id === d.contactId && c.companyId === d.companyId);
  d.versions.push({
    id: versionId,
    date,
    number: 'PRE-' + date.slice(0, 4) + '-' + versionId.slice(0, 8).toUpperCase(),
    lines: structuredClone(d.lines),
    snapshot: {
      title: d.title,
      owner: d.owner,
      client: client && structuredClone(client),
      contact: contact && structuredClone(contact),
    },
  });
  return n;
}
export function validLines(lines: unknown): lines is Deal['lines'] {
  return (
    Array.isArray(lines) &&
    lines.length <= 1000 &&
    lines.every(
      (l) =>
        l &&
        typeof l.description === 'string' &&
        !!l.description.trim() &&
        l.description.length <= 500 &&
        [l.qty, l.price, l.discount, l.tax].every(Number.isFinite) &&
        Number.isFinite(l.qty * l.price) &&
        Number.isFinite(l.qty * l.price * (1 + l.tax / 100)) &&
        l.qty > 0 &&
        l.price >= 0 &&
        l.discount >= 0 &&
        l.discount <= 100 &&
        l.tax >= 0 &&
        l.tax <= 100,
    )
  );
}
export function validData(d: Data): boolean {
  try {
    return (
      ['companies', 'contacts', 'deals', 'tasks', 'orders', 'notes'].every(
        (k) => Array.isArray(d[k as keyof Data]) && (d[k as keyof Data] || []).length <= 10000,
      ) &&
      d.deals.every(
        (x) =>
          typeof x.id === 'string' &&
          typeof x.title === 'string' &&
          ['En preparación', 'Pendiente del cliente', 'Ganado', 'Perdido'].includes(x.stage) &&
          validLines(x.lines) &&
          Array.isArray(x.versions) &&
          x.versions.every((v) => validLines(v.lines)),
      ) &&
      d.orders.every((o) => validLines(o.lines)) &&
      validSiteData(d) &&
      validLaborData(d) &&
      validProgressData(d)
    );
  } catch {
    return false;
  }
}
export function completeTask(data: Data, id: string, done: boolean): Data {
  const n = structuredClone(data),
    task = n.tasks.find((t) => t.id === id);
  if (!task) throw Error('Actividad no encontrada');
  task.done = done;
  delete task.cancelled;
  if (task.kind === 'Recepción')
    n.orders
      .filter((o) => o.dealId === task.dealId)
      .forEach((o) => (o.status = done ? 'Recibido' : 'Pendiente de revisión'));
  return n;
}
export function editDealData(
  data: Data,
  id: string,
  fields: Pick<
    Deal,
    'title' | 'companyId' | 'owner' | 'contactId' | 'expectedClose' | 'description'
  >,
): Data {
  const n = structuredClone(data),
    d = n.deals.find((d) => d.id === id);
  if (!d) throw Error('Trato no encontrado');
  if (!fields.title.trim()) throw Error('Introduce el nombre del trato');
  if (!n.companies.some((c) => c.id === fields.companyId)) throw Error('Empresa no encontrada');
  if (
    fields.companyId !== d.companyId &&
    (d.versions.length || n.orders.some((o) => o.dealId === id))
  )
    throw Error('La empresa no puede cambiar después de emitir un presupuesto o generar un pedido');
  if (
    fields.contactId &&
    !n.contacts.some((c) => c.id === fields.contactId && c.companyId === fields.companyId)
  )
    throw Error('El contacto debe pertenecer a la empresa');
  if (typeof fields.owner !== 'string' || !fields.owner.trim() || fields.owner.length > 150)
    throw Error('Responsable no válido');
  Object.assign(d, fields, { title: fields.title.trim() });
  n.tasks.filter((t) => t.dealId === id).forEach((t) => (t.owner = d.owner));
  return n;
}
export function editActivityData(
  data: Data,
  id: string,
  fields: {
    title: string;
    due: string;
    kind: string;
    priority?: ActivityPriority;
    time?: string;
    durationMinutes?: number | null;
  },
): Data {
  const n = structuredClone(data),
    t = n.tasks.find((t) => t.id === id);
  if (!t) throw Error('Actividad no encontrada');
  if (!fields.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(fields.due) || !siteDate(fields.due))
    throw Error('Introduce título y fecha válidos');
  if (t.kind === 'Recepción' && fields.kind !== 'Recepción')
    throw Error('La confirmación de recepción debe conservar su tipo');
  if (
    t.kind !== 'Recepción' &&
    !activityKinds.includes(fields.kind as (typeof activityKinds)[number])
  )
    throw Error('Tipo de actividad no válido');
  if (!validActivityPriority(fields.priority)) throw Error('Prioridad no válida');
  Object.assign(t, fields, { title: fields.title.trim() });
  return n;
}

export function markQuoteSent(
  data: Data,
  id: string,
  revisionId: string,
  sentAt: string,
  due: string,
  newId: () => string,
): Data {
  const n = structuredClone(data),
    d = n.deals.find((d) => d.id === id),
    v = d?.versions.find((v) => v.id === revisionId);
  if (!d || !v) throw Error('Revisión no encontrada');
  if (['Ganado', 'Perdido'].includes(d.stage))
    throw Error('Reabre el trato antes de registrar el envío');
  if (!sentAt || !Number.isFinite(Date.parse(sentAt))) throw Error('Fecha de envío no válida');
  const sentDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
    new Date(sentAt),
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !siteDate(due) || due < sentDay)
    throw Error('Indica una fecha de seguimiento válida');
  if (v.sentAt) return n;
  const older = new Set(d.versions.slice(0, d.versions.indexOf(v)).map((r) => r.id));
  n.tasks
    .filter(
      (t) =>
        t.dealId === id &&
        !!t.quoteRevisionId &&
        older.has(t.quoteRevisionId) &&
        !t.done &&
        !t.cancelled,
    )
    .forEach((t) => {
      t.cancelled = 'Sustituida por el envío de una nueva revisión';
    });
  v.sentAt = sentAt;
  v.followUp = due;
  d.stage = 'Pendiente del cliente';
  n.tasks.push({
    id: newId(),
    dealId: id,
    quoteRevisionId: revisionId,
    title: 'Seguimiento del presupuesto ' + (v.number || 'R' + (d.versions.indexOf(v) + 1)),
    due,
    owner: d.owner,
    done: false,
    kind: 'Llamada',
  });
  return n;
}

const siteDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validSiteData(data: Data): boolean {
  try {
    const works = data.works || [],
      reports = data.siteReports || [];
    return (
      Array.isArray(works) &&
      Array.isArray(reports) &&
      new Set(works.map((w) => w.id)).size === works.length &&
      new Set(reports.map((r) => r.id)).size === reports.length &&
      works.every(
        (w) =>
          validWorkControl(w) &&
          (w.plannedCost === undefined ||
            w.plannedCost === null ||
            (Number.isFinite(w.plannedCost) && w.plannedCost >= 0)) &&
          typeof w.id === 'string' &&
          !!w.name?.trim() &&
          !!w.responsible?.trim() &&
          data.companies.some((c) => c.id === w.companyId) &&
          typeof w.owner === 'string' &&
          !!w.owner.trim() &&
          w.owner.length <= 150 &&
          ['Planificada', 'En curso', 'Pausada', 'Finalizada'].includes(w.status) &&
          Number.isFinite(w.progress) &&
          w.progress >= 0 &&
          w.progress <= 100 &&
          (!w.start || siteDate(w.start)) &&
          (!w.end || siteDate(w.end)) &&
          (!w.start || !w.end || w.end >= w.start) &&
          (!w.orderId ||
            data.orders.some(
              (o) =>
                o.id === w.orderId &&
                data.deals.some((d) => d.id === o.dealId && d.companyId === w.companyId),
            )),
      ) &&
      reports.every(
        (r) =>
          typeof r.id === 'string' &&
          works.some((w) => w.id === r.workId) &&
          siteDate(r.date) &&
          !!r.summary?.trim() &&
          !!r.author?.trim() &&
          Array.isArray(r.crew) &&
          r.crew.length <= 50 &&
          r.crew.every(
            (c) =>
              ['Propio', 'Subcontrata'].includes(c.kind) &&
              !!c.name?.trim() &&
              Number.isInteger(c.people) &&
              c.people >= 1 &&
              c.people <= 100 &&
              Number.isFinite(c.hours) &&
              c.hours >= 0 &&
              c.hours <= 24,
          ) &&
          Array.isArray(r.photos) &&
          r.photos.length <= 8 &&
          r.photos.every(
            (p) =>
              validPhotoSource(p.src) && typeof p.caption === 'string' && p.caption.length <= 500,
          ),
      )
    );
  } catch {
    return false;
  }
}
export function saveWork(data: Data, work: Work): Data {
  const n = structuredClone(data);
  n.works ??= [];
  const i = n.works.findIndex((w) => w.id === work.id);
  if (i < 0) n.works.push(work);
  else n.works[i] = work;
  if (!validSiteData(n))
    throw Error(
      'Revisa los datos de la obra: cliente, responsable, fechas, superficie, importes y supervisión (máximo 24 horas por persona y día).',
    );
  return n;
}
export function saveSiteReport(data: Data, report: SiteReport): Data {
  const n = structuredClone(data);
  n.siteReports ??= [];
  const i = n.siteReports.findIndex((r) => r.id === report.id);
  if (i < 0) n.siteReports.push(report);
  else {
    if (n.siteReports[i].workId !== report.workId)
      throw Error('No se puede cambiar la obra del parte');
    n.siteReports[i] = report;
  }
  if (!validSiteData(n)) throw Error('Revisa el parte: fecha, autor, trabajos, equipos y fotos.');
  return n;
}

export function validLaborData(d: Data): boolean {
  try {
    const workers = d.workers || [],
      reports = d.laborReports || [],
      expenses = d.workExpenses || [];
    return (
      Array.isArray(workers) &&
      Array.isArray(reports) &&
      Array.isArray(expenses) &&
      new Set(workers.map((w) => w.id)).size === workers.length &&
      new Set(reports.map((r) => r.id)).size === reports.length &&
      new Set(expenses.map((e) => e.id)).size === expenses.length &&
      workers.every(
        (w) =>
          (w.archived === undefined || typeof w.archived === 'boolean') &&
          typeof w.id === 'string' &&
          !!w.name?.trim() &&
          ['Propio', 'Subcontrata'].includes(w.kind) &&
          (w.rate === null || (Number.isFinite(w.rate) && w.rate >= 0)),
      ) &&
      (d.works || []).every(
        (w) =>
          (!w.reviewer || (typeof w.reviewer === 'string' && w.reviewer.length <= 150)) &&
          (!w.workerIds ||
            (Array.isArray(w.workerIds) &&
              w.workerIds.every((id) => workers.some((x) => x.id === id)))),
      ) &&
      reports.every(
        (r) =>
          workers.some((w) => w.id === r.workerId) &&
          (d.works || []).some((w) => w.id === r.workId) &&
          siteDate(r.date) &&
          Number.isFinite(r.hours) &&
          r.hours > 0 &&
          r.hours <= 24 &&
          !!r.summary?.trim() &&
          ['Borrador', 'Pendiente', 'Devuelto', 'Confirmado'].includes(r.status) &&
          (r.rate === null ||
            (r.status === 'Confirmado' && Number.isFinite(r.rate) && r.rate >= 0)) &&
          Array.isArray(r.history) &&
          Array.isArray(r.photos) &&
          r.photos.length <= 8 &&
          r.photos.every((p) => validPhotoSource(p.src)),
      ) &&
      expenses.every(
        (e) =>
          (d.works || []).some((w) => w.id === e.workId) &&
          siteDate(e.date) &&
          !!e.concept?.trim() &&
          Number.isFinite(e.amount) &&
          e.amount >= 0 &&
          expenseKinds.includes(e.kind) &&
          (e.quantity == null || (Number.isFinite(e.quantity) && e.quantity >= 0)) &&
          (e.unit === undefined || (typeof e.unit === 'string' && e.unit.length <= 30)) &&
          ['Pendiente', 'Confirmado'].includes(e.status),
      )
    );
  } catch {
    return false;
  }
}

export function acceptQuote(
  data: Data,
  dealId: string,
  revisionId: string,
  date: string,
  newId: () => string,
): Data {
  const n = structuredClone(data),
    deal = n.deals.find((d) => d.id === dealId),
    revision = deal?.versions.find((v) => v.id === revisionId);
  if (!deal || !revision) throw Error('Revisión no encontrada');
  if (
    deal.acceptedRevisionId === revisionId &&
    n.orders.some((o) => o.dealId === dealId && o.revisionId === revisionId)
  )
    return n;
  if (deal.acceptedRevisionId || n.orders.some((o) => o.dealId === dealId))
    throw Error('Este trato ya tiene un pedido. No se puede sustituir su presupuesto aceptado');
  if (deal.stage === 'Perdido') throw Error('Reabre el trato antes de aceptar el presupuesto');
  if (!siteDate(date) || !revision.lines.length || !validLines(revision.lines))
    throw Error('Revisa la fecha y las partidas del presupuesto');
  deal.acceptedRevisionId = revisionId;
  deal.acceptedAt = date;
  return changeStage(n, dealId, 'Ganado', newId, date);
}
export function createWorkFromOrder(
  data: Data,
  orderId: string,
  actor: string,
  newId: () => string,
): Data {
  const order = data.orders.find((o) => o.id === orderId),
    deal = data.deals.find((d) => d.id === order?.dealId);
  if (!order || !deal) throw Error('Pedido no encontrado');
  if (actor !== 'Dirección' && actor !== deal.owner)
    throw Error('Solo el responsable del trato o Dirección pueden crear su obra');
  if (data.works?.some((w) => w.orderId === orderId))
    throw Error('Este pedido ya tiene una obra. Abre la obra existente');
  const id = newId(),
    n = saveWork(data, {
      id,
      orderId,
      companyId: deal.companyId,
      name: deal.title,
      address: '',
      owner: deal.owner,
      responsible: deal.owner,
      reviewer: deal.owner,
      workerIds: [],
      start: '',
      end: '',
      status: 'Planificada',
      progress: 0,
      notes: '',
      plannedCost: null,
    });
  return importWorkItems(n, id, 'order:' + orderId, actor, newId);
}
