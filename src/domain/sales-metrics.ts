import type { Data } from './model';
import { subtotal } from './model.ts';
export type SalesEvent = {
  kind:
    | 'company_created'
    | 'client_activated'
    | 'deal_created'
    | 'stage_changed'
    | 'activity_completed';
  entityId: string;
  companyId: string;
  owner: string;
  label: string;
  fromStage: string;
  toStage: string;
  amount: number;
  at?: string;
};
export function salesChanges(before: Data, after: Data, activeIds: Set<string>): SalesEvent[] {
  const events: SalesEvent[] = [];
  const add = (
    kind: SalesEvent['kind'],
    entityId: string,
    companyId: string,
    owner: string,
    label: string,
    fromStage = '',
    toStage = '',
    amount = 0,
  ) => events.push({ kind, entityId, companyId, owner, label, fromStage, toStage, amount });
  for (const c of after.companies)
    if (!before.companies.some((x) => x.id === c.id))
      add('company_created', c.id, c.id, c.owner, c.name);
  for (const d of after.deals) {
    const old = before.deals.find((x) => x.id === d.id);
    if (!old) add('deal_created', d.id, d.companyId, d.owner, d.title);
    if (old?.stage !== d.stage)
      add(
        'stage_changed',
        d.id,
        d.companyId,
        d.owner,
        d.title,
        old?.stage || '',
        d.stage,
        subtotal(after.orders.find((o) => o.dealId === d.id)?.lines || d.lines),
      );
    if (d.stage === 'Ganado' && !activeIds.has(d.companyId)) {
      activeIds.add(d.companyId);
      add(
        'client_activated',
        d.companyId,
        d.companyId,
        d.owner,
        after.companies.find((c) => c.id === d.companyId)?.name || d.title,
      );
    }
  }
  for (const t of after.tasks)
    if (t.done && !before.tasks.find((x) => x.id === t.id)?.done) {
      const d = after.deals.find((d) => d.id === t.dealId);
      add('activity_completed', t.id, d?.companyId || '', t.owner, t.title);
    }
  return events;
}
export type ClientLifecycle = { company_id: string; active: boolean; activated_at: string | null };
export function commercialAnalysis(
  d: Data,
  events: SalesEvent[],
  clients: ClientLifecycle[],
  today: string,
  creationDates: Record<string, string> = {},
) {
  const names = [
    ...new Set([
      ...d.companies.map((c) => c.owner),
      ...d.deals.map((x) => x.owner),
      ...(d.works || []).map((w) => w.owner),
      ...events.map((e) => e.owner),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const active = new Set(clients.filter((c) => c.active).map((c) => c.company_id));
  // A reopened and reclosed deal is counted only once per period, using its last closing event.
  const lastClose = new Map<string, SalesEvent>();
  for (const e of events)
    if (e.kind === 'stage_changed' && ['Ganado', 'Perdido'].includes(e.toStage))
      lastClose.set(e.entityId, e);
  return names.map((owner) => {
    const companies = d.companies.filter((c) => c.owner === owner),
      deals = d.deals.filter((x) => x.owner === owner),
      ownEvents = events.filter((e) => e.owner === owner),
      closed = [...lastClose.values()].filter((e) => e.owner === owner),
      won = closed.filter((e) => e.toStage === 'Ganado'),
      lost = closed.filter((e) => e.toStage === 'Perdido');
    const durations = closed.flatMap((e) => {
      const created =
        creationDates[e.entityId] || d.deals.find((x) => x.id === e.entityId)?.createdAt;
      const days = created && e.at ? (Date.parse(e.at) - Date.parse(created)) / 86400000 : NaN;
      return Number.isFinite(days) && days >= 0 ? [days] : [];
    });
    return {
      averageCloseDays: durations.length
        ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
        : null,
      measuredClosures: durations.length,
      owner,
      companies: companies.length,
      possible: companies.filter((c) => !active.has(c.id)).length,
      active: companies.filter((c) => active.has(c.id)).length,
      newProspects: new Set(
        ownEvents.filter((e) => e.kind === 'company_created').map((e) => e.entityId),
      ).size,
      activated: new Set(
        ownEvents.filter((e) => e.kind === 'client_activated').map((e) => e.entityId),
      ).size,
      newDeals: new Set(ownEvents.filter((e) => e.kind === 'deal_created').map((e) => e.entityId))
        .size,
      won: won.length,
      lost: lost.length,
      closed: closed.length,
      winRate: closed.length ? Math.round((won.length / closed.length) * 100) : null,
      wonValue: won.reduce((s, e) => s + e.amount, 0),
      completed: new Set(
        ownEvents.filter((e) => e.kind === 'activity_completed').map((e) => e.entityId),
      ).size,
      overdue: d.tasks.filter((t) => t.owner === owner && !t.done && !t.cancelled && t.due < today)
        .length,
      open: deals.filter((x) => !['Ganado', 'Perdido'].includes(x.stage)).length,
      pipeline: deals
        .filter((x) => !['Ganado', 'Perdido'].includes(x.stage))
        .reduce((s, x) => s + subtotal(x.lines), 0),
      currentWon: deals.filter((x) => x.stage === 'Ganado').length,
      currentWonValue: deals
        .filter((x) => x.stage === 'Ganado')
        .reduce(
          (s, x) => s + subtotal(d.orders.find((o) => o.dealId === x.id)?.lines || x.lines),
          0,
        ),
      works: (d.works || []).filter((w) => w.owner === owner).length,
    };
  });
}

export function previousPeriod(from: string, to: string) {
  const start = Date.parse(from + 'T12:00:00Z'),
    end = Date.parse(to + 'T12:00:00Z');
  const duration = end - start + 86400000;
  return {
    from: new Date(start - duration).toISOString().slice(0, 10),
    to: new Date(start - 86400000).toISOString().slice(0, 10),
  };
}
