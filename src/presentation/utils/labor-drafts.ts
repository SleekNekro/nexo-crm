import type { LaborReport } from '../../domain/model';
export type LocalLaborDraft = {
  key: string;
  account: string;
  savedAt: string;
  report: LaborReport;
};
let pending: Promise<unknown> = Promise.resolve();
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('nexo-local-drafts', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('labor', { keyPath: 'key' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const job = pending
    .catch(() => {})
    .then(async () => {
      const database = await db();
      return new Promise<T>((resolve, reject) => {
        const tx = database.transaction('labor', mode);
        const request = action(tx.objectStore('labor'));
        tx.oncomplete = () => {
          database.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          database.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          database.close();
          reject(tx.error);
        };
      });
    });
  pending = job;
  return job;
}
export const readLaborDrafts = async (account: string) =>
  ((await run('readonly', (s) => s.getAll())) as LocalLaborDraft[]).filter(
    (d) => d.account === account,
  );
export const writeLaborDraft = (account: string, report: LaborReport) =>
  run('readwrite', (s) =>
    s.put({ key: account + ':' + report.id, account, report, savedAt: new Date().toISOString() }),
  );
export const deleteLaborDraft = (account: string, id: string) =>
  run('readwrite', (s) => s.delete(account + ':' + id));
