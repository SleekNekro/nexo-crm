import type { Data } from './model';
// Merge independent records only; never overwrite another edit to the same record.
export function mergeIndependent(base: Data, local: Data, remote: Data): Data {
  const result = structuredClone(remote);
  for (const key of [
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
  ] as const) {
    const before = new Map((base[key] || []).map((x) => [x.id, x])),
      after = new Map((local[key] || []).map((x) => [x.id, x])),
      latest = new Map((remote[key] || []).map((x) => [x.id, x]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(id),
        b = after.get(id),
        c = latest.get(id);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (JSON.stringify(a) !== JSON.stringify(c) && JSON.stringify(b) !== JSON.stringify(c))
        throw Error(
          'Otro usuario ha cambiado este mismo registro. Tu borrador se conserva. Revisa los datos actuales antes de volver a guardar.',
        );
      if (b) latest.set(id, b);
      else latest.delete(id);
    }
    (result[key] as unknown[]) = Array.from(latest.values());
  }
  return result;
}
