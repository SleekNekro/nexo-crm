import { isDeepStrictEqual } from 'node:util';
import type { Data } from '../domain/model';
export type AuditChange = {
  workId: string;
  kind: string;
  entityId: string;
  action: string;
  reason: string;
  before: unknown;
  after: unknown;
};
const clean = (entry: any) => {
  if (!entry) return null;
  const { changeReason, ...value } = entry;
  return value;
};
export function workAuditChanges(before: Data, after: Data): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const kind of ['supervision', 'expense'] as const) {
    const entries = (d: Data) =>
      kind === 'expense'
        ? (d.workExpenses || []).map((e) => ({ workId: e.workId, entry: e }))
        : (d.works || []).flatMap((w) =>
            (w.supervision || []).map((e) => ({ workId: w.id, entry: e })),
          );
    const old = new Map(entries(before).map((e) => [e.workId + ':' + e.entry.id, e])),
      next = new Map(entries(after).map((e) => [e.workId + ':' + e.entry.id, e]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const a = old.get(id),
        b = next.get(id);
      if (isDeepStrictEqual(clean(a?.entry), clean(b?.entry))) continue;
      const current = b || a!;
      const reason = (
        b?.entry.changeReason ||
        after.works?.find((w) => w.id === current.workId)?.changeReason ||
        ''
      ).trim();
      if (a && (reason.length < 5 || reason.length > 1000))
        throw Error('Indica el motivo de la corrección o eliminación (entre 5 y 1000 caracteres).');
      changes.push({
        workId: current.workId,
        kind,
        entityId: current.entry.id,
        action: !a ? 'Alta' : !b ? 'Eliminación' : 'Corrección',
        reason: a ? reason : 'Registro inicial',
        before: clean(a?.entry),
        after: clean(b?.entry),
      });
    }
  }
  return changes;
}
