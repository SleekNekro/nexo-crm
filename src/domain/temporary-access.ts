import type { Data } from './model';
export function validTemporaryAccess(
  data: Data,
  profile: unknown,
  end: unknown,
  scope: unknown,
  today: string,
) {
  if (
    typeof end !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    Number.isNaN(Date.parse(end)) ||
    new Date(end).toISOString().slice(0, 10) !== end ||
    end < today
  )
    return false;
  if (typeof profile !== 'string' || !profile.startsWith('operario:')) return false;
  const id = profile.slice(9);
  if (!data.workers?.some((w) => w.id === id && w.kind === 'Subcontrata')) return false;
  return (
    Array.isArray(scope) &&
    scope.length > 0 &&
    scope.length <= 100 &&
    new Set(scope).size === scope.length &&
    scope.every(
      (id) =>
        typeof id === 'string' &&
        data.works?.some((w) => w.id === id && w.workerIds?.includes(profile.slice(9))),
    )
  );
}
