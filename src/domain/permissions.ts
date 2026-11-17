// Views constrain server-side reads as well as navigation; roles still constrain ownership.
export const viewNames = [
  'Resumen',
  'Mi día',
  'Empresas',
  'Contactos',
  'Tratos',
  'Presupuestos',
  'Catálogo',
  'Pedidos',
  'Actividades',
  'Obras',
  'Equipo',
  'Análisis',
  'Depuración',
] as const;
export const actionLabels = {
  products: 'Mantener precios y disponibilidad del catálogo',
  companies: 'Editar empresas y contactos',
  deals: 'Gestionar tratos y presupuestos',
  tasks: 'Gestionar actividades',
  orders: 'Gestionar pedidos',
  works: 'Gestionar obras, partidas y partes de obra',
  labor: 'Registrar o revisar partes individuales según el rol',
  expenses: 'Gestionar gastos de obra',
  team: 'Gestionar personas y asignaciones',
  accounts: 'Gestionar cuentas del equipo',
} as const;
export type AccountPermissions = { views: string[]; actions: string[] };
type Subject = { role: string; permissions?: AccountPermissions | null };
export function availableViews(role: string): string[] {
  return viewNames.filter(
    (v) =>
      role === 'developer' ||
      (role === 'worker'
        ? v === 'Mi día'
        : v !== 'Depuración' && (role === 'admin' || !['Equipo', 'Análisis'].includes(v))),
  );
}
export function availableActions(role: string): string[] {
  return Object.keys(actionLabels).filter((a) =>
    role === 'worker'
      ? a === 'labor'
      : role === 'commercial'
        ? !['team', 'accounts', 'products'].includes(a)
        : true,
  );
}
export const canView = (u: Subject, view: string) =>
  availableViews(u.role).includes(view) &&
  (u.role === 'developer' || !u.permissions || u.permissions.views.includes(view));
export const canAct = (u: Subject, action: string) =>
  availableActions(u.role).includes(action) &&
  (u.role === 'developer' || !u.permissions || u.permissions.actions.includes(action));
export function validPermissions(value: unknown, role: string): value is AccountPermissions {
  if (!value || typeof value !== 'object') return false;
  const p = value as AccountPermissions;
  return (
    Object.keys(p).length === 2 &&
    Array.isArray(p.views) &&
    Array.isArray(p.actions) &&
    p.views.every((v) => typeof v === 'string' && availableViews(role).includes(v)) &&
    p.actions.every((a) => typeof a === 'string' && availableActions(role).includes(a)) &&
    new Set(p.views).size === p.views.length &&
    new Set(p.actions).size === p.actions.length
  );
}
export const entityAction: Record<string, string> = {
  companies: 'companies',
  contacts: 'companies',
  deals: 'deals',
  notes: 'deals',
  tasks: 'tasks',
  orders: 'orders',
  works: 'works',
  siteReports: 'works',
  workItems: 'works',
  workZones: 'works',
  workers: 'team',
  laborReports: 'labor',
  workExpenses: 'expenses',
};

// Account delegation is narrower than ordinary data administration.
// Only the platform developer may create/manage privileged accounts.
export function canManageAccount(
  actor: Subject & { platformDeveloper?: boolean },
  target: Subject & { global_role?: string },
) {
  if (actor.platformDeveloper) return true;
  if (actor.role !== 'admin' || !canView(actor, 'Equipo') || !canAct(actor, 'accounts'))
    return false;
  if (
    ['admin', 'developer'].includes(target.role) ||
    ['admin', 'developer'].includes(target.global_role || '')
  )
    return false;
  return (
    availableViews(target.role).every((v) => !canView(target, v) || canView(actor, v)) &&
    availableActions(target.role).every((a) => !canAct(target, a) || canAct(actor, a))
  );
}

export const entityView: Record<string, string> = {
  companies: 'Empresas',
  contacts: 'Contactos',
  deals: 'Tratos',
  notes: 'Tratos',
  tasks: 'Actividades',
  orders: 'Pedidos',
  works: 'Obras',
  siteReports: 'Obras',
  workExpenses: 'Obras',
  workItems: 'Obras',
  workZones: 'Obras',
  laborReports: 'Obras',
  workers: 'Equipo',
};
export function canReadEntity(u: Subject, key: string) {
  if (u.role === 'worker')
    return (
      canView(u, 'Mi día') &&
      ['works', 'workers', 'workItems', 'workZones', 'laborReports'].includes(key)
    );
  if (key === 'workers' && u.role === 'commercial' && canView(u, 'Obras')) return true;
  return canView(u, entityView[key]) && (key !== 'orders' || canReadQuotes(u));
}
export function canReadQuotes(u: Subject) {
  return ['Tratos', 'Presupuestos', 'Empresas', 'Contactos'].every((view) => canView(u, view));
}
