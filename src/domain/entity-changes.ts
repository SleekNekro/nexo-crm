import type { Data } from './model';
export const entityKeys = [
  'companies',
  'contacts',
  'deals',
  'tasks',
  'orders',
  'notes',
  'works',
  'siteReports',
  'workers',
  'laborReports',
  'workExpenses',
  'workItems',
  'workZones',
] as const;
export type EntityChange = {
  collection: (typeof entityKeys)[number];
  id: string;
  value: Record<string, unknown> | null;
};
export function entityChanges(before: Data, after: Data): EntityChange[] {
  const result: EntityChange[] = [];
  for (const collection of entityKeys) {
    const old = new Map((before[collection] || []).map((r) => [r.id, r]));
    const next = new Map((after[collection] || []).map((r) => [r.id, r]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      if (JSON.stringify(old.get(id)) !== JSON.stringify(next.get(id)))
        result.push({ collection, id, value: (next.get(id) as Record<string, unknown>) || null });
    }
  }
  return result;
}
export function applyEntityChanges(base: Data, changes: unknown): Data {
  if (!Array.isArray(changes) || changes.length > 10000) throw Error('Cambios no válidos');
  const result = structuredClone(base),
    seen = new Set<string>();
  for (const c of changes) {
    if (
      !c ||
      !entityKeys.includes(c.collection) ||
      typeof c.id !== 'string' ||
      !c.id ||
      !(
        c.value === null ||
        (typeof c.value === 'object' && !Array.isArray(c.value) && c.value.id === c.id)
      )
    )
      throw Error('Registro no válido');
    const identity = JSON.stringify([c.collection, c.id]);
    if (seen.has(identity)) throw Error('Registro repetido');
    seen.add(identity);
    const key = c.collection as (typeof entityKeys)[number];
    const rows = (result[key] || []) as { id: string }[];
    const index = rows.findIndex((r) => r.id === c.id);
    if (c.value === null) {
      if (index < 0) throw Error('Registro no encontrado');
      rows.splice(index, 1);
    } else if (index < 0) rows.push(c.value);
    else rows[index] = c.value;
    (result[key] as unknown[]) = rows;
  }
  return result;
}
