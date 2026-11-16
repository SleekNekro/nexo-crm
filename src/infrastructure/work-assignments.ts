import { memberDirectory } from './member-directory.ts';
import type { PoolClient } from 'pg';
import type { Data } from '../domain/model';
export async function bindWorkAccounts(
  db: PoolClient,
  before: Data,
  after: Data,
  workspaceId = 'nexo',
) {
  const accounts = (
    await db.query(
      `SELECT id,username,display_name AS name,CASE WHEN role IN ('admin','developer') THEN username ELSE profile END AS profile,active FROM (${memberDirectory}) d WHERE role IN ('commercial','admin','developer')`,
      [workspaceId],
    )
  ).rows;
  for (const work of after.works || []) {
    const old = before.works?.find((w) => w.id === work.id);
    for (const [field, idField] of [
      ['owner', 'ownerUserId'],
      ['reviewer', 'reviewerUserId'],
    ] as const) {
      if (field === 'reviewer' && old && !work.reviewer) {
        delete work.reviewerUserId;
        continue;
      }
      const value = work[field] || work.owner;
      const matches = accounts.filter((a) => a.profile === value);
      const unchanged = old && (old[field] || old.owner) === value;
      if (matches.length > 1)
        throw Error('Hay varias cuentas con el mismo perfil; revisa sus asignaciones.');
      const account = matches[0];
      if (!unchanged && account && !account.active)
        throw Error('Selecciona una cuenta activa para asignar la obra.');
      // Legacy unbound names stay visible for explicit reassignment, never guessed.
      if (!account) {
        if (!unchanged)
          throw Error(
            'Selecciona una cuenta real para el comercial y el responsable de la obra. Si procede de un pedido, asigna primero su trato a una cuenta.',
          );
        delete work[idField];
      } else {
        work[idField] = account.id;
        if (field === 'reviewer') {
          if (!old && !work.reviewer) work.reviewer = value;
          work.responsible = account.name;
        }
      }
    }
  }
}
