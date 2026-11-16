import { validActivityPriority } from '../domain/activity-priority.ts';
import { companyStatuses, activateCompaniesOnWin } from '../domain/company-status.ts';
import { companyRemoval } from '../domain/company-removal.ts';
import { reconcileWorkDates } from '../domain/work-dates.ts';
import { validSchedule } from '../domain/commercial-followup.ts';
import { isDeepStrictEqual } from 'node:util';
import { changeStage, markQuoteSent } from '../domain/actions.ts';
import type { Data } from '../domain/model';
const same = (a: unknown, b: unknown) =>
  isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
export const validBusinessDate = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const requireRule = (condition: unknown, message: string) => {
  if (!condition) throw Error(message);
};
/** Rules run on the complete, authorized server state, never a filtered client view. */
export function validateBusinessChange(before: Data, next: Data) {
  for (const key of [
    'companies',
    'contacts',
    'deals',
    'tasks',
    'orders',
    'notes',
    'works',
    'workers',
    'siteReports',
    'laborReports',
    'workExpenses',
    'workItems',
    'workZones',
  ] as const) {
    const rows = next[key] || [];
    requireRule(
      Array.isArray(rows) &&
        rows.every((r) => typeof r.id === 'string' && r.id.trim()) &&
        new Set(rows.map((r) => r.id)).size === rows.length,
      'Hay identificadores vacíos o repetidos',
    );
  }
  for (const company of before.companies) {
    if (!next.companies.some((c) => c.id === company.id)) {
      const { reason } = companyRemoval(before, company.id);
      requireRule(!reason, reason);
      requireRule(
        !next.contacts.some((c) => c.companyId === company.id),
        'Elimina también los contactos de la empresa para no dejarlos sin empresa.',
      );
    }
  }
  const companies = new Set(next.companies.map((c) => c.id)),
    deals = new Map(next.deals.map((d) => [d.id, d]));
  for (const c of next.companies) {
    requireRule(c.name?.trim(), 'La empresa necesita un nombre');
    requireRule(
      c.status === undefined || companyStatuses.includes(c.status),
      'Estado de empresa no válido',
    );
  }
  for (const c of next.contacts)
    requireRule(
      companies.has(c.companyId) && c.name?.trim(),
      'El contacto necesita nombre y una empresa existente',
    );
  for (const d of next.deals) {
    requireRule(companies.has(d.companyId), 'El trato debe pertenecer a una empresa existente');
    requireRule(
      !d.contactId ||
        next.contacts.some((c) => c.id === d.contactId && c.companyId === d.companyId),
      'El contacto del trato debe pertenecer a su empresa',
    );
    requireRule(
      !d.expectedClose || validBusinessDate(d.expectedClose),
      'La fecha prevista de cierre no es válida',
    );
    requireRule(
      new Set(d.versions.map((v) => v.id)).size === d.versions.length,
      'No se pueden repetir revisiones',
    );
    const old = before.deals.find((x) => x.id === d.id);
    if (d.acceptedRevisionId) {
      const revision = d.versions.find((v) => v.id === d.acceptedRevisionId),
        order = next.orders.find((o) => o.dealId === d.id);
      requireRule(
        revision &&
          validBusinessDate(d.acceptedAt) &&
          order?.revisionId === revision.id &&
          same(order.lines, revision.lines),
        'La aceptación debe corresponder a una revisión y a su pedido',
      );
      if (!old?.acceptedRevisionId)
        requireRule(
          d.stage === 'Ganado' && !before.orders.some((o) => o.dealId === d.id),
          'No se puede aceptar otro presupuesto sobre un pedido existente',
        );
    } else requireRule(!d.acceptedAt, 'La fecha de aceptación necesita una revisión');
    if (old?.acceptedRevisionId)
      requireRule(
        old.acceptedRevisionId === d.acceptedRevisionId && old.acceptedAt === d.acceptedAt,
        'No se puede modificar la aceptación registrada',
      );
    if (old) {
      requireRule(
        d.companyId === old.companyId ||
          (!old.versions.length && !before.orders.some((o) => o.dealId === d.id)),
        'No se puede cambiar la empresa de un trato con presupuestos emitidos o pedidos',
      );
      for (const v of old.versions) {
        const updated = d.versions.find((x) => x.id === v.id);
        requireRule(updated, 'No se puede eliminar una revisión emitida');
        const { sentAt, followUp, ...frozen } = v;
        const { sentAt: newSent, followUp: newFollow, ...newFrozen } = updated!;
        requireRule(
          same(frozen, newFrozen),
          'Una revisión emitida es inmutable. Crea una nueva revisión',
        );
        if (sentAt)
          requireRule(
            sentAt === newSent && followUp === newFollow,
            'El registro de envío de una revisión no se puede reescribir',
          );
      }
    }
  }
  for (const d of before.deals)
    if (!deals.has(d.id))
      requireRule(
        !d.versions.length && !before.orders.some((o) => o.dealId === d.id),
        'No se puede eliminar un trato con presupuestos emitidos o pedidos',
      );
  for (const key of ['tasks', 'orders', 'notes'] as const)
    for (const r of next[key])
      requireRule(
        deals.has(r.dealId),
        'No se pueden dejar actividades, pedidos o notas sin su trato',
      );
  requireRule(
    new Set(next.orders.map((o) => o.dealId)).size === next.orders.length,
    'Un trato no puede generar pedidos duplicados',
  );
  for (const order of next.orders)
    if (!before.orders.some((o) => o.id === order.id)) {
      const deal = deals.get(order.dealId);
      requireRule(
        deal?.stage === 'Ganado' &&
          same(
            order.lines,
            deal.acceptedRevisionId
              ? deal.versions.find((v) => v.id === deal.acceptedRevisionId)?.lines
              : deal.lines,
          ) &&
          order.revisionId === deal.acceptedRevisionId &&
          validBusinessDate(order.date),
        'Un pedido nuevo debe corresponder a las partidas de un trato ganado',
      );
    }
  for (const order of before.orders) {
    const updated = next.orders.find((o) => o.id === order.id);
    requireRule(
      updated && same({ ...order, status: undefined }, { ...updated, status: undefined }),
      'No se puede eliminar ni alterar el contenido de un pedido generado',
    );
  }
  for (const t of next.tasks)
    requireRule(
      validBusinessDate(t.due) &&
        validSchedule(t) &&
        validActivityPriority(t.priority) &&
        (t.result === undefined || (typeof t.result === 'string' && t.result.length <= 4000)),
      'Revisa la fecha, hora y prioridad de la actividad. El resultado admite hasta 4000 caracteres.',
    );
  for (const item of before.workItems || []) {
    const updated = next.workItems?.find((i) => i.id === item.id);
    const used = (before.laborReports || []).some((r) =>
      r.measurements?.some((m) =>
        before.workZones?.some((z) => z.id === m.zoneId && z.itemId === item.id),
      ),
    );
    if (updated)
      requireRule(
        updated.workId === item.workId && (!used || updated.unit === item.unit),
        'No se puede cambiar la obra o la unidad de una partida con mediciones',
      );
    else requireRule(!used, 'No se puede eliminar una partida con mediciones');
  }
  for (const zone of before.workZones || []) {
    const used = (before.laborReports || []).some((r) =>
      r.measurements?.some((m) => m.zoneId === zone.id),
    );
    const updated = next.workZones?.find((z) => z.id === zone.id);
    if (used)
      requireRule(
        updated && updated.itemId === zone.itemId,
        'No se puede eliminar ni trasladar una zona con mediciones',
      );
  }
  for (const worker of before.workers || [])
    if (!next.workers?.some((w) => w.id === worker.id))
      requireRule(
        !before.laborReports?.some((r) => r.workerId === worker.id),
        'Esta persona tiene partes registrados. Desactiva su cuenta para conservar el historial',
      );
  for (const w of next.works || [])
    if (w.orderId && !before.works?.some((old) => old.id === w.id && old.orderId === w.orderId))
      requireRule(
        (next.works || []).filter((other) => other.orderId === w.orderId).length === 1,
        'El pedido ya tiene una obra vinculada',
      );
  const daily = new Map<string, number>();
  for (const r of next.laborReports || [])
    if (r.status !== 'Devuelto') {
      const key = JSON.stringify([r.workerId, r.date]);
      daily.set(key, (daily.get(key) || 0) + r.hours);
    }
  requireRule(
    [...daily.values()].every((h) => Number.isFinite(h) && h <= 24),
    'Las horas de una persona entre todas las obras no pueden superar 24 al día',
  );
}

/** Rebuild stage side effects even when a client only submits the new stage. */
export function reconcileCommercialChange(
  before: Data,
  input: Data,
  newId: () => string,
  date: string,
): Data {
  let next = structuredClone(input);
  for (const deal of input.deals) {
    for (const revision of deal.versions) {
      const previous = before.deals
        .find((d) => d.id === deal.id)
        ?.versions.find((v) => v.id === revision.id);
      if (!revision.sentAt || previous?.sentAt) continue;
      const generated = next.tasks.filter(
        (t) =>
          t.dealId === deal.id &&
          t.quoteRevisionId === revision.id &&
          !before.tasks.some((old) => old.id === t.id),
      );
      next.tasks = next.tasks.filter((t) => !generated.some((g) => g.id === t.id));
      const target = next.deals
        .find((d) => d.id === deal.id)!
        .versions.find((v) => v.id === revision.id)!;
      delete target.sentAt;
      delete target.followUp;
      next = markQuoteSent(
        next,
        deal.id,
        revision.id,
        revision.sentAt,
        revision.followUp || '',
        () => generated[0]?.id || newId(),
      );
    }
  }
  for (const deal of next.deals) {
    const old = before.deals.find((d) => d.id === deal.id);
    if (old?.stage !== deal.stage)
      next = changeStage(next, deal.id, deal.stage, newId, date, deal.reason);
  }
  return reconcileWorkDates(before, activateCompaniesOnWin(before, next), date);
}
