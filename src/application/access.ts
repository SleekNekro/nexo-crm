import {
  canAct,
  canView,
  canReadEntity,
  canReadQuotes,
  entityAction,
  type AccountPermissions,
} from '../domain/permissions.ts';
import { isDeepStrictEqual as equal } from 'node:util';
import { canReview, reviewLabor, saveLabor } from '../domain/labor.ts';
import type { Data, LaborReport } from '../domain/model';
import { workProgress } from '../domain/progress.ts';
import { isAdmin } from '../domain/roles.ts';
export type Identity = {
  workspace?: import('../domain/workspace').WorkspaceInfo;
  workspaceId?: string;
  platformDeveloper?: boolean;
  permissions?: AccountPermissions | null;
  id: string;
  username: string;
  displayName?: string;
  role: 'developer' | 'admin' | 'commercial' | 'worker';
  profile: string;
  mustChange: boolean;
  external?: boolean;
  workScope?: string[] | null;
  accessUntil?: string | null;
};
export const keys = [
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
function roleVisibleData(d: Data, u: Identity): Data {
  d = structuredClone(d);
  if (isAdmin(u.role)) return d;
  const worker = u.role === 'worker',
    wid = u.profile.slice(9);
  const works = (d.works || []).filter((w) =>
    worker
      ? w.workerIds?.includes(wid) && (!u.external || u.workScope?.includes(w.id))
      : (w.ownerUserId ? w.ownerUserId === u.id : w.owner === u.profile) ||
        (w.reviewerUserId ? w.reviewerUserId === u.id : w.reviewer === u.profile),
  );
  const workIds = new Set(works.map((w) => w.id));
  const deals = worker ? [] : d.deals.filter((x) => x.owner === u.profile);
  const dealIds = new Set(deals.map((x) => x.id));
  const companyIds = new Set([...deals.map((x) => x.companyId), ...works.map((x) => x.companyId)]);
  const items = (d.workItems || []).filter((x) => workIds.has(x.workId));
  return {
    ...(worker
      ? {
          zoneProgress: works.flatMap((w) =>
            workProgress(d, w.id).items.flatMap((i) =>
              i.zones.map((z) => ({ id: z.id, confirmed: z.confirmed, proposed: z.proposed })),
            ),
          ),
        }
      : {}),
    companies: worker
      ? []
      : d.companies.filter((x) => x.owner === u.profile || companyIds.has(x.id)),
    contacts: worker
      ? []
      : d.contacts.filter((x) =>
          d.companies.some((c) => c.id === x.companyId && c.owner === u.profile),
        ),
    deals,
    tasks: worker ? [] : d.tasks.filter((x) => dealIds.has(x.dealId) && x.owner === u.profile),
    orders: worker ? [] : d.orders.filter((x) => dealIds.has(x.dealId)),
    notes: worker ? [] : d.notes.filter((x) => dealIds.has(x.dealId)),
    works: worker
      ? works.map((w) => ({
          ...w,
          plannedCost: null,
          budgetAmount: null,
          supervision: [],
          companyId: '',
          orderId: '',
          notes: '',
          workerIds: [wid],
        }))
      : works,
    workers: (d.workers || [])
      .filter((x) => (worker ? x.id === wid : works.some((w) => w.workerIds?.includes(x.id))))
      .map((x) => (worker ? { ...x, rate: null, company: '' } : x)),
    laborReports: (d.laborReports || [])
      .filter((x) => (worker ? x.workerId === wid && workIds.has(x.workId) : workIds.has(x.workId)))
      .map((x) => (worker ? { ...x, rate: null } : x)),
    siteReports: worker ? [] : (d.siteReports || []).filter((x) => workIds.has(x.workId)),
    workExpenses: worker ? [] : (d.workExpenses || []).filter((x) => workIds.has(x.workId)),
    workItems: worker ? items.map((x) => ({ ...x, source: undefined })) : items,
    workZones: (d.workZones || []).filter((x) => items.some((i) => i.id === x.itemId)),
  };
}
// Redacted fields are restored from the stored record when other fields are edited.
function protectedFields(key: string, u: Identity): string[] {
  if (u.role === 'worker') return [];
  if (key === 'deals')
    return [
      ...(!canReadQuotes(u) ? ['lines', 'versions', 'acceptedRevisionId', 'acceptedAt'] : []),
      ...(!canView(u, 'Contactos') ? ['contactId'] : []),
    ];
  if (key === 'works' && !canReadQuotes(u)) return ['budgetAmount'];
  return [];
}
function maskRecord(key: string, record: any, u: Identity) {
  const masked = structuredClone(record);
  for (const field of protectedFields(key, u)) {
    if (field === 'lines' || field === 'versions') masked[field] = [];
    else if (field === 'budgetAmount') masked[field] = null;
    else delete masked[field];
  }
  return masked;
}
export function visibleData(d: Data, u: Identity): Data {
  const scoped = roleVisibleData(d, u);
  for (const key of keys) {
    if (!canReadEntity(u, key)) (scoped as any)[key] = [];
    else if (protectedFields(key, u).length)
      (scoped as any)[key] = (scoped[key] || []).map((r) => maskRecord(key, r, u));
  }
  if (u.role === 'worker' && !canView(u, 'Mi día')) delete scoped.zoneProgress;
  return scoped;
}
const canonical = (v: unknown) => JSON.parse(JSON.stringify(v));
const same = (a: unknown, b: unknown) => equal(canonical(a ?? null), canonical(b ?? null));
export function applyAuthorized(current: Data, input: Data, u: Identity, now: string): Data {
  const visible = visibleData(current, u),
    result = structuredClone(current);
  for (const key of Object.keys(input))
    if (key !== 'zoneProgress' && !keys.includes(key as (typeof keys)[number]))
      throw Error('Campo no permitido');
  if (!same(input.zoneProgress, visible.zoneProgress))
    throw Error('El avance lo calcula el servidor');
  const photoRefs = new Set(
    [...(visible.siteReports || []), ...(visible.laborReports || [])].flatMap((r) =>
      r.photos.map((p) => p.src),
    ),
  );
  for (const key of keys) {
    const submitted = input[key] || [],
      before = visible[key] || [];
    if (!Array.isArray(submitted) || new Set(submitted.map((x) => x.id)).size !== submitted.length)
      throw Error('Registros duplicados');
    for (const id of new Set([...submitted.map((x) => x.id), ...before.map((x) => x.id)])) {
      const old = before.find((x) => x.id === id),
        next = submitted.find((x) => x.id === id);
      if (same(old, next)) continue;
      if (
        key === 'works' &&
        old &&
        next &&
        (!same((old as any).owner, (next as any).owner) ||
          !same((old as any).reviewer, (next as any).reviewer)) &&
        !canAct(u, 'team')
      )
        throw Error(
          'Solo las cuentas con permiso de gestionar el equipo pueden reasignar responsables',
        );
      if (!canReadEntity(u, key) || !canAct(u, entityAction[key]))
        throw Error('Tu cuenta no tiene permiso para realizar esta acción');
      if (
        key === 'works' &&
        !same((old as any)?.workerIds || [], (next as any)?.workerIds || []) &&
        !canAct(u, 'team')
      )
        throw Error('No tienes permiso para asignar el equipo');
      const original = current[key]?.find((x) => x.id === id);
      if (original && !next && protectedFields(key, u).length)
        throw Error('No puedes eliminar un registro con información oculta');
      if (
        key === 'deals' &&
        original &&
        next &&
        !canReadQuotes(u) &&
        (original as any).stage !== (next as any).stage
      )
        throw Error('Se necesita acceso al presupuesto para cambiar la etapa');
      if (next && protectedFields(key, u).length) {
        const mask = maskRecord(key, original || {}, u);
        for (const field of protectedFields(key, u)) {
          if (!same((next as any)[field], mask[field]))
            throw Error('No tienes permiso para modificar campos ocultos');
        }
      }
      if (original && !old) throw Error('Registro no autorizado');
      if (!next && (u.role === 'worker' || key === 'laborReports'))
        throw Error('No puedes eliminar partes');
      const record = (next || original) as unknown as Record<string, any>;
      for (const p of record.photos || [])
        if (p.src.startsWith('/api/photos/') && !photoRefs.has(p.src))
          throw Error('Foto no autorizada');
      if (key === 'laborReports') {
        const report = next as LaborReport;
        if (u.role === 'worker') {
          if (!visible.works?.some((w) => w.id === report.workId))
            throw Error('Esta obra no está autorizada para tu cuenta');
          if (!['Borrador', 'Pendiente'].includes(report.status) || report.rate !== null)
            throw Error('No puedes confirmar ni valorar tus horas');
          const updated = saveLabor(
            result,
            report,
            u.profile.slice(9),
            report.status === 'Pendiente',
            now,
          );
          result.laborReports = updated.laborReports;
        } else {
          if (!original) throw Error('Los partes individuales los registra el operario');
          const oldReport = original as LaborReport;
          const action = report.history.at(-1);
          if (!action || !['Confirmar', 'Devolver', 'Reabrir', 'Valorar'].includes(action.action))
            throw Error('Acción de revisión no válida');
          const strip = (r: LaborReport) => {
            const { history, updatedAt, rate, status, ...rest } = r;
            return rest;
          };
          if (!same(strip(oldReport), strip(report)))
            throw Error('El responsable no puede modificar las horas ni el contenido del operario');
          const updated = reviewLabor(
            result,
            id,
            action.action as 'Confirmar' | 'Devolver' | 'Reabrir' | 'Valorar',
            u.profile,
            action.reason,
            now,
          );
          const expected = updated.laborReports!.find((r) => r.id === id)!;
          if (expected.status !== report.status || expected.rate !== report.rate)
            throw Error('Estado o tarifa no válidos');
          result.laborReports = updated.laborReports;
        }
        continue;
      }
      if (u.role === 'worker') throw Error('Solo puedes modificar tus partes');
      if (!isAdmin(u.role)) {
        const ownsCompany = (id: string) =>
          result.companies.some((c) => c.id === id && c.owner === u.profile);
        const ownsDeal = (id: string) =>
          result.deals.some((d) => d.id === id && d.owner === u.profile);
        const reviews = (id: string) =>
          result.works?.some((w) => w.id === id && canReview(w, u.profile));
        const rOld = original as unknown as Record<string, any> | undefined;
        let allowed = false;
        if (key === 'companies')
          allowed = record.owner === u.profile && (!rOld || rOld.owner === u.profile);
        if (key === 'contacts')
          allowed = ownsCompany(record.companyId) && (!rOld || ownsCompany(rOld.companyId));
        if (key === 'deals')
          allowed =
            record.owner === u.profile &&
            ownsCompany(record.companyId) &&
            (!rOld || rOld.owner === u.profile);
        if (['tasks', 'orders', 'notes'].includes(key))
          allowed =
            ownsDeal(record.dealId) &&
            (!rOld || ownsDeal(rOld.dealId)) &&
            (!('owner' in record) || record.owner === u.profile);
        if (key === 'works')
          allowed =
            (!rOld
              ? record.owner === u.profile &&
                ownsCompany(record.companyId) &&
                !(record.workerIds || []).length
              : !!reviews(id) &&
                record.owner === rOld.owner &&
                record.reviewer === rOld.reviewer &&
                same(record.workerIds, rOld.workerIds)) &&
            (!record.reviewer ||
              record.reviewer === u.profile ||
              record.reviewer === rOld?.reviewer);
        if (['siteReports', 'workExpenses', 'workItems'].includes(key))
          allowed = !!reviews(record.workId) && (!rOld || record.workId === rOld.workId);
        if (key === 'workZones')
          allowed =
            !!result.workItems?.some((i) => i.id === record.itemId && reviews(i.workId)) &&
            (!rOld || rOld.itemId === record.itemId);
        if (!allowed) throw Error('No tienes permiso para modificar este registro');
      }
      const list = (result[key] || []) as { id: string }[];
      const index = list.findIndex((x) => x.id === id);
      if (!next) {
        if (index >= 0) list.splice(index, 1);
      } else if (index < 0) list.push(next);
      else list[index] = next;
      if (next && original) {
        const stored = list.find((x) => x.id === id) as any;
        for (const field of protectedFields(key, u)) {
          if (Object.hasOwn(original, field))
            stored[field] = structuredClone((original as any)[field]);
          else delete stored[field];
        }
      }
      (result[key] as unknown) = list;
    }
  }
  return result;
}
