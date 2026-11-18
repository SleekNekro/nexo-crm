import type { Company, Contact, Data } from './model';
import { possibleDuplicates } from './commercial-followup.ts';
import { companyStatuses } from './company-status.ts';
export type ImportKind = 'companies' | 'contacts';
export type ColumnMap = Record<string, number>;
export const companyFields = {
  name: 'Nombre',
  taxId: 'CIF / NIF',
  email: 'Correo',
  phone: 'Teléfono',
  sector: 'Sector',
  city: 'Ciudad',
  address: 'Dirección',
  postalCode: 'Código postal',
  province: 'Provincia',
  status: 'Estado comercial',
};
export const contactFields = {
  name: 'Nombre',
  company: 'Empresa (nombre o CIF)',
  email: 'Correo',
  phone: 'Teléfono',
  role: 'Cargo',
};
export const normalized = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
/** RFC-style quoting, including separators/newlines in quoted fields. No formula evaluation. */
export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  if (typeof input !== 'string' || input.length > 1_000_000)
    throw Error('El CSV debe ocupar menos de 1 MB.');
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let quoted = false,
    first = '';
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if (c === '\n' && !quoted) break;
    first += c;
  }
  const separator = [';', ',', '\t']
    .map((s) => {
      let q = false,
        n = 0;
      for (const c of first) {
        if (c === '"') q = !q;
        else if (!q && c === s) n++;
      }
      return { s, n };
    })
    .sort((a, b) => b.n - a.n)[0].s;
  const records: string[][] = [];
  let row: string[] = [],
    value = '',
    inQuote = false,
    closed = false;
  const field = () => {
    row.push(value.trim());
    value = '';
    closed = false;
  };
  const record = () => {
    field();
    if (row.some(Boolean)) records.push(row);
    row = [];
    if (records.length > 1001) throw Error('Máximo 1.000 filas por importación.');
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuote = false;
          closed = true;
        }
      } else value += c;
    } else if (c === separator) field();
    else if (c === '\n') record();
    else if (c === '"' && !value && !closed) inQuote = true;
    else {
      if (closed && c.trim()) throw Error('CSV no válido: texto después de una comilla de cierre.');
      if (c === '"') throw Error('CSV no válido: comilla sin escapar.');
      value += c;
    }
  }
  if (inQuote) throw Error('CSV no válido: falta cerrar una comilla.');
  if (value || row.length || closed) record();
  if (records.length < 2) throw Error('Añade una cabecera y al menos una fila de datos.');
  const [headers, ...rows] = records;
  if (
    headers.length > 30 ||
    headers.some((h) => !h) ||
    new Set(headers.map(normalized)).size !== headers.length
  )
    throw Error('Las cabeceras deben ser únicas, no vacías y como máximo 30.');
  return { headers, rows };
}
export function suggestColumns(headers: string[], kind: ImportKind): ColumnMap {
  const aliases: Record<string, string[]> = {
    name: [
      'nombre',
      'name',
      kind === 'companies' ? 'empresa' : 'contacto',
      kind === 'companies' ? 'accountname' : 'contactname',
      'razonsocial',
    ],
    taxId: ['cif', 'nif', 'taxid'],
    email: ['email', 'correo', 'correoelectronico'],
    phone: ['telefono', 'phone', 'movil'],
    sector: ['sector', 'industry'],
    city: ['ciudad', 'city'],
    address: ['direccion', 'address'],
    postalCode: ['codigopostal', 'postalcode', 'cp'],
    province: ['provincia', 'province'],
    status: ['estado', 'estadocomercial'],
    company: ['empresa', 'company', 'accountname', 'cifempresa'],
    role: ['cargo', 'role', 'puesto'],
  };
  return Object.fromEntries(
    Object.keys(kind === 'companies' ? companyFields : contactFields).map((k) => [
      k,
      headers.findIndex((h) => aliases[k]?.includes(normalized(h))),
    ]),
  );
}
export type ImportRow = {
  row: number;
  name: string;
  company?: string;
  error: string;
  duplicates: string[];
  record?: Company | Contact;
};
export function previewImport(
  data: Data,
  text: string,
  kind: ImportKind,
  mapping: ColumnMap,
  owner: string,
): ImportRow[] {
  if (!['companies', 'contacts'].includes(kind)) throw Error('Tipo de importación no válido.');
  const { headers, rows } = parseCsv(text),
    fields = kind === 'companies' ? companyFields : contactFields;
  if (!mapping || typeof mapping !== 'object') throw Error('Selecciona las columnas.');
  for (const [k, v] of Object.entries(mapping))
    if (!(k in fields) || !Number.isInteger(v) || v < -1 || v >= headers.length)
      throw Error('Asignación de columnas no válida.');
  if ((mapping.name ?? -1) < 0 || (kind === 'contacts' && (mapping.company ?? -1) < 0))
    throw Error('Selecciona las columnas obligatorias.');
  const mapped = Object.values(mapping).filter((v) => v >= 0);
  if (new Set(mapped).size !== mapped.length)
    throw Error('Cada columna solo puede usarse una vez.');
  const seen: (Company | Contact)[] = [];
  return rows.map((cells, index) => {
    const row = index + 2,
      get = (k: string) => cells[mapping[k]]?.trim() || '',
      name = get('name'),
      email = get('email');
    let error =
      cells.length !== headers.length ? 'El número de columnas no coincide con la cabecera.' : '';
    if (!name) error = 'Falta el nombre.';
    if (cells.some((c) => c.length > 500)) error = 'Hay un campo con más de 500 caracteres.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = 'Correo no válido.';
    let record: Company | Contact;
    if (kind === 'companies') {
      const status = get('status') || 'Posible cliente';
      if (!companyStatuses.includes(status as Company['status'] & string))
        error = 'Estado comercial no reconocido.';
      record = {
        id: 'import-row-' + row,
        name,
        owner,
        email,
        phone: get('phone'),
        sector: get('sector'),
        city: get('city'),
        taxId: get('taxId'),
        address: get('address'),
        postalCode: get('postalCode'),
        province: get('province'),
        status: status as Company['status'],
      };
    } else {
      const key = normalized(get('company'));
      const matches = data.companies.filter(
        (c) => key && (normalized(c.name) === key || (!!c.taxId && normalized(c.taxId) === key)),
      );
      if (matches.length !== 1)
        error = matches.length
          ? 'Hay varias empresas coincidentes. Usa un CIF único o fusiona primero.'
          : 'Empresa no encontrada. Importa primero las empresas.';
      record = {
        id: 'import-row-' + row,
        name,
        email,
        phone: get('phone'),
        role: get('role'),
        companyId: matches[0]?.id || '',
      };
    }
    const candidates = [...(kind === 'companies' ? data.companies : data.contacts), ...seen].filter(
      (c) =>
        kind === 'companies' || ('companyId' in c && c.companyId === (record as Contact).companyId),
    );
    const matches = new Set(possibleDuplicates(candidates, record).map((m) => m.name));
    for (const c of candidates)
      if (normalized(c.name) === normalized(name) && name) matches.add(c.name);
    if (!error) seen.push(record);
    return {
      row,
      name,
      company: kind === 'contacts' ? get('company') : undefined,
      error,
      duplicates: [...matches],
      record,
    };
  });
}
export function applyImport(
  data: Data,
  rows: ImportRow[],
  selected: number[],
  id: () => string,
): Data {
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length)
    throw Error('Selecciona al menos una fila válida.');
  const next = structuredClone(data);
  for (const number of selected) {
    const r = rows.find((r) => r.row === number);
    if (!r?.record || r.error || r.duplicates.length)
      throw Error('La selección contiene errores o duplicados. Revisa la vista previa.');
    const record = { ...r.record, id: id() };
    if ('companyId' in record) next.contacts.push(record);
    else next.companies.push(record);
  }
  return next;
}
