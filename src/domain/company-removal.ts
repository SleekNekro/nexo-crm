import type { Data } from './model';
export function companyRemoval(data: Data, companyId: string) {
  const company = data.companies.find((c) => c.id === companyId);
  const deals = data.deals.filter((d) => d.companyId === companyId);
  const works = (data.works || []).filter((w) => w.companyId === companyId);
  const contacts = data.contacts.filter((c) => c.companyId === companyId);
  const reason = !company
    ? 'La empresa ya no existe.'
    : deals.length || works.length
      ? 'Esta empresa tiene tratos o obras vinculados. No se puede eliminar sin perder su historial.'
      : '';
  return { contacts: contacts.length, deals: deals.length, works: works.length, reason };
}
export function removeCompany(data: Data, companyId: string): Data {
  const { reason } = companyRemoval(data, companyId);
  if (reason) throw Error(reason);
  return {
    ...data,
    companies: data.companies.filter((c) => c.id !== companyId),
    contacts: data.contacts.filter((c) => c.companyId !== companyId),
  };
}
