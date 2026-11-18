import type { Company, Contact, Data } from './model';
import { companyStatus } from './company-status.ts';
export type MergeKind = 'companies' | 'contacts';
export type MergeChoices = Record<string, 'source' | 'target'>;
export const mergeCompanyFields = [
  'name',
  'taxId',
  'email',
  'phone',
  'sector',
  'city',
  'address',
  'postalCode',
  'province',
  'status',
  'owner',
] as const;
export const mergeContactFields = ['name', 'email', 'phone', 'role'] as const;
export function mergeCommercial(
  data: Data,
  kind: MergeKind,
  sourceId: string,
  targetId: string,
  choices: MergeChoices = {},
) {
  if (!['companies', 'contacts'].includes(kind) || sourceId === targetId)
    throw Error('Selecciona dos registros distintos.');
  const source = data[kind].find((r) => r.id === sourceId),
    target = data[kind].find((r) => r.id === targetId);
  if (!source || !target) throw Error('Algún registro ya no existe. Actualiza la vista previa.');
  if (kind === 'contacts' && (source as Contact).companyId !== (target as Contact).companyId)
    throw Error('Los contactos deben pertenecer a la misma empresa. Fusiona primero sus empresas.');
  const fields: readonly string[] = kind === 'companies' ? mergeCompanyFields : mergeContactFields;
  if (
    !choices ||
    typeof choices !== 'object' ||
    Object.entries(choices).some(
      ([k, v]) => !fields.includes(k) || !['source', 'target'].includes(v),
    )
  )
    throw Error('Selección de campos no válida.');
  const result = { ...target } as unknown as Record<string, unknown>;
  for (const field of fields) {
    const a = (source as unknown as Record<string, unknown>)[field],
      b = (target as unknown as Record<string, unknown>)[field];
    result[field] = choices[field] === 'source' ? a : choices[field] === 'target' ? b : b || a;
  }
  if (
    kind === 'companies' &&
    !choices.status &&
    [companyStatus(source as Company, data), companyStatus(target as Company, data)].includes(
      'Cliente activo',
    )
  )
    result.status = 'Cliente activo';
  result.customFields = { ...source.customFields, ...target.customFields };
  const next = structuredClone(data);
  if (kind === 'companies') {
    next.companies = next.companies
      .filter((c) => c.id !== sourceId)
      .map((c) => (c.id === targetId ? (result as Company) : c));
    next.contacts = next.contacts.map((c) =>
      c.companyId === sourceId ? { ...c, companyId: targetId } : c,
    );
    next.deals = next.deals.map((d) =>
      d.companyId === sourceId ? { ...d, companyId: targetId } : d,
    );
    if (next.works)
      next.works = next.works.map((w) =>
        w.companyId === sourceId ? { ...w, companyId: targetId } : w,
      );
  } else {
    next.contacts = next.contacts
      .filter((c) => c.id !== sourceId)
      .map((c) => (c.id === targetId ? (result as Contact) : c));
    next.deals = next.deals.map((d) =>
      d.contactId === sourceId ? { ...d, contactId: targetId } : d,
    );
  }
  // Legacy revisions without snapshots must freeze their pre-merge client/contact first.
  for (const deal of next.deals) {
    const old = data.deals.find((d) => d.id === deal.id)!;
    if (kind === 'companies' ? old.companyId !== sourceId : old.contactId !== sourceId) continue;
    for (const revision of deal.versions) {
      const previous = revision.snapshot;
      revision.snapshot = {
        title: old.title,
        owner: old.owner,
        ...previous,
        client:
          previous?.client || structuredClone(data.companies.find((c) => c.id === old.companyId)),
        contact:
          previous?.contact || structuredClone(data.contacts.find((c) => c.id === old.contactId)),
      };
    }
  }
  // Only live references move. Issued quote snapshots, orders, activities, notes and work history stay intact.
  const linkedDeals = data.deals.filter((d) =>
    kind === 'companies' ? d.companyId === sourceId : d.contactId === sourceId,
  );
  return {
    next,
    source,
    target,
    result,
    impact: {
      contacts:
        kind === 'companies' ? data.contacts.filter((c) => c.companyId === sourceId).length : 0,
      deals: linkedDeals.length,
      quotes: linkedDeals.reduce((n, d) => n + d.versions.length, 0),
      orders: data.orders.filter((o) => linkedDeals.some((d) => d.id === o.dealId)).length,
      tasks: data.tasks.filter((t) => linkedDeals.some((d) => d.id === t.dealId)).length,
      works:
        kind === 'companies'
          ? (data.works || []).filter((w) => w.companyId === sourceId).length
          : 0,
    },
  };
}
