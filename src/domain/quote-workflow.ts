import type { Data, Deal } from './model';
import type { WorkspaceBrand } from './workspace';
import { nexoBrand } from './workspace.ts';
const stable = (v: any): string =>
  JSON.stringify(v, (_, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
const clientFields = (c: any) =>
  c
    ? Object.fromEntries(
        ['id', 'name', 'taxId', 'address', 'postalCode', 'city', 'province', 'email', 'phone'].map(
          (k) => [k, c[k] || ''],
        ),
      )
    : null;
const contactFields = (c: any) =>
  c
    ? Object.fromEntries(['id', 'name', 'role', 'email', 'phone'].map((k) => [k, c[k] || '']))
    : null;
export function matchingDraftRevision(data: Data, deal: Deal, brand: WorkspaceBrand) {
  const revision = deal.versions.at(-1),
    snapshot = revision?.snapshot;
  if (!revision || !snapshot) return undefined;
  return stable(revision.lines) === stable(deal.lines) &&
    snapshot.title === deal.title &&
    snapshot.owner === deal.owner &&
    stable(clientFields(snapshot.client)) ===
      stable(clientFields(data.companies.find((c) => c.id === deal.companyId))) &&
    stable(contactFields(snapshot.contact)) ===
      stable(contactFields(data.contacts.find((c) => c.id === deal.contactId))) &&
    stable(snapshot.brand || nexoBrand) === stable(brand)
    ? revision
    : undefined;
}
/** Three weekdays; no external holiday calendar. User can edit before registering the send. */
export function suggestedFollowUp(day: string, days = 3) {
  const date = new Date(day + 'T12:00:00Z');
  let left = Math.max(0, Math.min(90, days));
  while (left) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) left--;
  }
  return date.toISOString().slice(0, 10);
}

/** Read the current activity, never the frozen date recorded when the PDF was sent. */
export function revisionFollowUp(data: Data, dealId: string, revisionId: string) {
  const tasks = data.tasks.filter((t) => t.dealId === dealId && t.quoteRevisionId === revisionId);
  const pending = tasks
    .filter((t) => !t.done && !t.cancelled)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  if (pending) return { state: 'pending' as const, due: pending.due, title: pending.title };
  if (tasks.some((t) => t.done)) return { state: 'completed' as const };
  if (tasks.length) return { state: 'cancelled' as const };
  return { state: 'missing' as const };
}
