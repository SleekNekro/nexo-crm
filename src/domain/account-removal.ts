import type { Data } from './model';
export function accountRemovalReason(
  data: Data,
  account: { id: string; username: string; role: string; profile: string; global_role?: string },
  actorId: string,
): string {
  if (account.id === actorId) return 'No puedes eliminar tu propia cuenta.';
  if (account.global_role === 'developer' || account.role === 'developer')
    return 'La cuenta de desarrollador está protegida.';
  if (account.role === 'worker') return '';
  const owner = account.role === 'admin' ? account.username : account.profile;
  const counts = [
    [data.companies.filter((x) => x.owner === owner).length, 'empresas'],
    [data.deals.filter((x) => x.owner === owner).length, 'tratos'],
    [
      data.tasks.filter((x) => x.owner === owner && !x.done && !x.cancelled).length,
      'actividades pendientes',
    ],
    [
      (data.works || []).filter(
        (x) => x.owner === owner || x.responsible === owner || x.ownerUserId === account.id,
      ).length,
      'obras',
    ],
  ].filter(([count]) => Number(count) > 0);
  return counts.length
    ? 'Reasigna primero: ' +
        counts.map(([count, label]) => `${count} ${label}`).join(', ') +
        '. Puedes desactivar la cuenta mientras tanto.'
    : '';
}
