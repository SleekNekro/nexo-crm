import { settingsOrDefault, validateCustomData } from '../domain/business-settings';
import { applyEntityChanges, entityChanges, type EntityChange } from '../domain/entity-changes';
import { workAuditChanges } from '../application/work-audit';
import { recordWorkAudit } from '../infrastructure/work-audit';
import { bindWorkAccounts } from '../infrastructure/work-assignments';
import { isDeepStrictEqual } from 'node:util';
import { validData } from '../domain/actions';
import { seed } from '../domain/model';
import { initData, pool } from '../infrastructure/db';
import { lockEntities, writeEntities } from '../infrastructure/entity-store';
import { persistPhotos } from '../infrastructure/photo-storage';
import { recordSales } from '../infrastructure/sales-storage';
import { applyAuthorized, visibleData, type Identity } from './access';
import { reconcileCommercialChange, validateBusinessChange } from './business-rules';
const result = (body: unknown, status = 200) => ({ body, status });
const businessDay = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export async function saveWorkspace(
  b: { version: number; data?: ReturnType<typeof seed>; changes?: EntityChange[] },
  user: Identity,
) {
  await initData();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await lockEntities(client);
    const currentConfig = (
      await client.query('SELECT settings FROM public.crm_workspaces WHERE id=$1', [
        user.workspaceId,
      ])
    ).rows[0]?.settings;
    user = {
      ...user,
      workspace: user.workspace ? { ...user.workspace, settings: currentConfig } : undefined,
    };
    if (r.rows[0].version !== b.version) {
      await client.query('ROLLBACK');
      return result(
        { error: 'Otro usuario ha actualizado los datos. Recarga antes de continuar.' },
        409,
      );
    }
    let next: ReturnType<typeof seed>;
    try {
      const incoming = b.changes
        ? applyEntityChanges(visibleData(r.rows[0].data, user), b.changes)
        : b.data;
      if (!incoming) throw Error('Faltan los cambios');
      next = applyAuthorized(r.rows[0].data, incoming, user!, new Date().toISOString());
    } catch (e) {
      await client.query('ROLLBACK');
      return result({ error: (e as Error).message }, 403);
    }
    try {
      next = reconcileCommercialChange(
        r.rows[0].data,
        next,
        () => crypto.randomUUID(),
        businessDay(),
        settingsOrDefault(user.workspace?.settings),
      );
      for (const d of next.deals) {
        const previous = r.rows[0].data.deals.find((old) => old.id === d.id);
        if (previous && previous.stage !== d.stage && previous.pipelinePhase === d.pipelinePhase)
          delete d.pipelinePhase;
      }
      validateCustomData(next, settingsOrDefault(user.workspace?.settings));
      validateBusinessChange(r.rows[0].data, next);
      const removedCompanies = r.rows[0].data.companies
        .filter((c) => !next.companies.some((n) => n.id === c.id))
        .map((c) => c.id);
      if (
        removedCompanies.length &&
        (
          await client.query(
            'SELECT id FROM crm_company_notes WHERE company_id=ANY($1::text[]) LIMIT 1',
            [removedCompanies],
          )
        ).rowCount
      )
        throw Error(
          'Esta empresa tiene notas de seguimiento. No se puede eliminar sin perder su historial; puedes fusionarla con otra empresa.',
        );
      await bindWorkAccounts(client, r.rows[0].data, next, user.workspaceId);
    } catch (e) {
      await client.query('ROLLBACK');
      return result({ error: (e as Error).message }, 422);
    }
    for (const deal of next.deals)
      for (const revision of deal.versions) {
        if (
          !r.rows[0].data.deals
            .find((d) => d.id === deal.id)
            ?.versions.some((v) => v.id === revision.id)
        ) {
          revision.snapshot = {
            title: deal.title,
            owner: deal.owner,
            client: next.companies.find((c) => c.id === deal.companyId),
            contact: next.contacts.find((c) => c.id === deal.contactId),
            brand: user.workspace?.brand,
          };
        }
      }
    if (!validData(next)) {
      await client.query('ROLLBACK');
      return result({ error: 'Datos no válidos' }, 400);
    }
    let auditChanges;
    try {
      auditChanges = workAuditChanges(r.rows[0].data, next);
    } catch (e) {
      await client.query('ROLLBACK');
      return result({ error: (e as Error).message }, 422);
    }
    for (const w of next.works || []) {
      delete w.changeReason;
      for (const entry of w.supervision || []) delete entry.changeReason;
    }
    for (const expense of next.workExpenses || []) delete expense.changeReason;
    const removedWorkers = (r.rows[0].data.workers || [])
      .filter((w) => !next.workers?.some((n) => n.id === w.id))
      .map((w) => 'operario:' + w.id);
    if (removedWorkers.length)
      await client.query(
        "DELETE FROM public.crm_memberships WHERE workspace_id=$1 AND role='worker' AND profile=ANY($2::text[])",
        [user.workspaceId, removedWorkers],
      );
    const archivedProfiles = (next.workers || [])
      .filter((w) => w.archived)
      .map((w) => 'operario:' + w.id);
    if (archivedProfiles.length)
      await client.query(
        "UPDATE public.crm_memberships SET active=false WHERE workspace_id=$1 AND role='worker' AND profile=ANY($2::text[])",
        [user.workspaceId, archivedProfiles],
      );
    const before = r.rows[0].data;
    const timestamp = new Date().toISOString();
    for (const deal of next.deals) {
      const old = before.deals.find((d) => d.id === deal.id);
      const clean = (d: typeof deal | undefined) => {
        if (!d) return null;
        const { createdAt, updatedAt, ...rest } = d;
        return rest;
      };
      const related = (d: typeof next) => ({
        tasks: d.tasks.filter((t) => t.dealId === deal.id),
        notes: d.notes.filter((n) => n.dealId === deal.id),
      });
      deal.createdAt = old?.createdAt || (!old ? timestamp : undefined);
      deal.updatedAt =
        !isDeepStrictEqual(clean(old), clean(deal)) ||
        !isDeepStrictEqual(related(before), related(next))
          ? timestamp
          : old?.updatedAt;
    }
    for (const work of next.works || []) {
      const previous = before.works?.find((w) => w.id === work.id);
      const withoutStamp = (w: typeof work | undefined) => {
        if (!w) return null;
        const { updatedAt, ...rest } = w;
        return rest;
      };
      const associated = (d: typeof next) => ({
        reports: d.siteReports?.filter((x) => x.workId === work.id) || [],
        labor: d.laborReports?.filter((x) => x.workId === work.id) || [],
        expenses: d.workExpenses?.filter((x) => x.workId === work.id) || [],
        items: d.workItems?.filter((x) => x.workId === work.id) || [],
        zones:
          d.workZones?.filter((z) =>
            d.workItems?.some((i) => i.id === z.itemId && i.workId === work.id),
          ) || [],
      });
      work.updatedAt =
        !isDeepStrictEqual(withoutStamp(previous), withoutStamp(work)) ||
        !isDeepStrictEqual(associated(before), associated(next))
          ? timestamp
          : previous?.updatedAt;
    }
    next = await persistPhotos(next, user.workspaceId);
    await recordWorkAudit(client, auditChanges, user);
    await recordSales(client, r.rows[0].data, next, user!.id);
    await writeEntities(client, r.rows[0].data, next);
    await client.query('UPDATE crm_state_meta SET version=version+1 WHERE id=1');
    await client.query('COMMIT');
    const visible = visibleData(next, user);
    return result({
      version: b.version + 1,
      ...(b.changes
        ? {
            changes: entityChanges(visibleData(before, user), visible),
            zoneProgress: visible.zoneProgress,
          }
        : { data: visible }),
      storage: 'postgres',
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
