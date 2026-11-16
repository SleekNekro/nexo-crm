import type { Data } from './model';

/** Start an unissued quote and its deal together; never creates an order or a work. */
export function createCompanyQuote(data: Data, companyId: string, id: string): Data {
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) throw Error('La empresa ya no está disponible. Actualiza la página.');
  if (data.deals.some((d) => d.id === id)) throw Error('Este presupuesto ya se ha creado.');
  const contacts = data.contacts.filter((c) => c.companyId === companyId);
  const base = `Presupuesto · ${company.name}`;
  const titles = new Set(data.deals.filter((d) => d.companyId === companyId).map((d) => d.title));
  let title = base;
  for (let n = 2; titles.has(title); n++) title = `${base} · ${n}`;
  const next = structuredClone(data);
  next.deals.push({
    id,
    companyId,
    title,
    owner: company.owner,
    stage: 'En preparación',
    contactId: contacts.length === 1 ? contacts[0].id : '',
    expectedClose: '',
    description: '',
    lines: [],
    versions: [],
  });
  return next;
}
