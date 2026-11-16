import type { Company, Data } from './model';
export const companyStatuses = [
  'Posible cliente',
  'En seguimiento',
  'Cliente activo',
  'Cliente inactivo',
  'Descartado',
] as const;
export type CompanyStatus = (typeof companyStatuses)[number];
export function companyStatus(
  company: Company,
  data: Pick<Data, 'deals' | 'orders'>,
): CompanyStatus {
  if (company.status) return company.status;
  const deals = data.deals.filter((d) => d.companyId === company.id);
  return deals.some((d) => d.stage === 'Ganado' || data.orders.some((o) => o.dealId === d.id))
    ? 'Cliente activo'
    : 'Posible cliente';
}
export function setCompanyStatus(data: Data, companyId: string, status: string): Data {
  if (!companyStatuses.includes(status as CompanyStatus))
    throw Error('Estado de empresa no válido');
  if (!data.companies.some((c) => c.id === companyId)) throw Error('Empresa no encontrada');
  return {
    ...data,
    companies: data.companies.map((c) =>
      c.id === companyId ? { ...c, status: status as CompanyStatus } : c,
    ),
  };
}

/** Server-side consequence of a new win; never requires permission to edit companies manually. */
export function activateCompaniesOnWin(before: Data, next: Data): Data {
  const wonCompanies = new Set(
    next.deals
      .filter(
        (d) =>
          d.stage === 'Ganado' && before.deals.find((old) => old.id === d.id)?.stage !== 'Ganado',
      )
      .map((d) => d.companyId),
  );
  return {
    ...next,
    companies: next.companies.map((c) =>
      wonCompanies.has(c.id) && (c.status === undefined || c.status === 'Posible cliente')
        ? { ...c, status: 'Cliente activo' }
        : c,
    ),
  };
}
