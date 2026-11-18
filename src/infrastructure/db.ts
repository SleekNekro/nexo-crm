import { companyHistorySchema } from './company-history';
import { commercialDataAuditSchema } from './commercial-data-audit';
import { Pool } from 'pg';
import { quoteMailSchema } from '../application/send-quote';
import { reminderSchema } from '../application/activity-reminders';
import { mailSchema } from './mail-settings';
import {
  workspacePool,
  requestWorkspace,
  poolForWorkspace,
  type WorkspaceRecord,
} from './workspace-store';
import { workAuditSchema } from './work-audit';
import { initProducts } from './product-store';
import { seed } from '../domain/model';
import { migrateEntities, readEntities } from './entity-store';
import { salesSchema } from './sales-storage';
export const preview = process.env.NODE_ENV === 'development' && process.env.CRM_PREVIEW === '1';
// Each call resolves the authenticated workspace. No public fallback for tenant schemas.
export const pool = {
  query: async (...args: any[]) => {
    const p = await workspacePool();
    return (p.query as any)(...args);
  },
  connect: async () => (await workspacePool()).connect(),
} as unknown as Pool;
const initialized = new Map<string, Promise<void>>();
export function initWorkspaceData(w: Pick<WorkspaceRecord, 'id' | 'schema_name'>) {
  let pending = initialized.get(w.id);
  if (!pending) {
    pending = (async () => {
      const p = poolForWorkspace(w);
      await p.query(salesSchema);
      await p.query(mailSchema);
      await p.query(quoteMailSchema);
      await p.query(reminderSchema);
      await p.query(workAuditSchema);
      await p.query(commercialDataAuditSchema);
      await initProducts(p, false);
      await migrateEntities(p, () => ({
        companies: [],
        contacts: [],
        deals: [],
        tasks: [],
        orders: [],
        notes: [],
      }));
      await p.query(companyHistorySchema);
    })().catch((e) => {
      initialized.delete(w.id);
      throw e;
    });
    initialized.set(w.id, pending);
  }
  return pending;
}
export async function initData() {
  await initWorkspaceData(await requestWorkspace());
}
export async function readState() {
  await initData();
  return readEntities(pool);
}
