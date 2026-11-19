/** Declarative modules: definitions are data, never executable code or SQL. */
export const fieldTypes = [
  'text',
  'number',
  'money',
  'date',
  'select',
  'boolean',
  'company',
  'contact',
] as const;
export type ModuleField = {
  id: string;
  label: string;
  type: (typeof fieldTypes)[number];
  required: boolean;
  archived: boolean;
  options: string[];
};
export const moduleActions = ['read', 'create', 'edit', 'delete'] as const;
export const moduleRoles = ['admin', 'commercial', 'worker'] as const;
export type CustomModule = {
  id: string;
  name: string;
  description: string;
  icon: 'box' | 'tool' | 'calendar';
  enabled: boolean;
  fields: ModuleField[];
  permissions: Record<(typeof moduleRoles)[number], (typeof moduleActions)[number][]>;
};
export type ModuleRecord = {
  id: string;
  title: string;
  values: Record<string, string | number | boolean>;
  version: number;
};
const identifier = (s: unknown) =>
  typeof s === 'string' &&
  /^[a-z][a-z0-9_-]{0,79}$/.test(s) &&
  !['constructor', 'prototype', '__proto__'].includes(s);
const plain = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function canUseModule(
  m: CustomModule,
  role: string,
  action: (typeof moduleActions)[number],
) {
  return (
    m.enabled &&
    (role === 'developer' ||
      (moduleRoles.includes(role as any) &&
        m.permissions[role as keyof typeof m.permissions].includes(action)))
  );
}
export function validateModule(value: unknown): asserts value is CustomModule {
  if (
    !plain(value) ||
    !identifier(value.id) ||
    !text(value.name, 60) ||
    typeof value.description !== 'string' ||
    value.description.length > 500 ||
    !['box', 'tool', 'calendar'].includes(value.icon) ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.fields) ||
    value.fields.length > 20 ||
    !plain(value.permissions)
  )
    throw Error('Revisa el nombre y la definición del módulo.');
  const ids = new Set();
  for (const f of value.fields) {
    if (
      !plain(f) ||
      !identifier(f.id) ||
      ids.has(f.id) ||
      !text(f.label, 60) ||
      !fieldTypes.includes(f.type) ||
      typeof f.required !== 'boolean' ||
      typeof f.archived !== 'boolean' ||
      !Array.isArray(f.options) ||
      f.options.length > 40 ||
      f.options.some((o: unknown) => !text(o, 80)) ||
      new Set(f.options).size !== f.options.length ||
      (f.type === 'select' && !f.options.length)
    )
      throw Error('Revisa los campos: nombres únicos, tipos y opciones válidos.');
    ids.add(f.id);
  }
  for (const role of moduleRoles) {
    const rights = value.permissions[role];
    if (
      !Array.isArray(rights) ||
      rights.some((a) => !moduleActions.includes(a)) ||
      new Set(rights).size !== rights.length ||
      (rights.length && !rights.includes('read'))
    )
      throw Error('Para modificar registros también hay que permitir consultarlos.');
  }
}
export function validateModuleChange(
  before: CustomModule,
  next: CustomModule,
  rows: ModuleRecord[],
) {
  validateModule(next);
  if (before.id !== next.id) throw Error('No se puede cambiar el identificador del módulo.');
  for (const f of before.fields) {
    const replacement = next.fields.find((x) => x.id === f.id);
    if (!rows.some((r) => r.values[f.id] !== undefined && r.values[f.id] !== '')) continue;
    if (!replacement || replacement.type !== f.type)
      throw Error(`«${f.label}» tiene datos. Archiva el campo para conservarlos.`);
    if (
      f.type === 'select' &&
      rows.some((r) => r.values[f.id] && !replacement.options.includes(String(r.values[f.id])))
    )
      throw Error(`«${f.label}» tiene opciones utilizadas; no se pueden quitar.`);
  }
  for (const f of next.fields.filter((f) => f.required && !f.archived)) {
    if (rows.some((r) => r.values[f.id] === undefined || r.values[f.id] === ''))
      throw Error(
        `Completa «${f.label}» en los registros existentes antes de hacerlo obligatorio.`,
      );
  }
}
export function validateModuleRecord(m: CustomModule, title: unknown, values: unknown) {
  if (!text(title, 160) || !plain(values)) throw Error('Escribe un nombre para el registro.');
  if (Object.keys(values).some((k) => !m.fields.some((f) => f.id === k)))
    throw Error('El registro contiene campos no definidos.');
  for (const f of m.fields) {
    const v = values[f.id];
    if (v === undefined || v === '') {
      if (f.required && !f.archived) throw Error(`Completa «${f.label}».`);
      continue;
    }
    let valid = false;
    if (['text', 'company', 'contact', 'select'].includes(f.type))
      valid = typeof v === 'string' && v.length <= (f.type === 'text' ? 4000 : 160);
    if (f.type === 'select') valid = valid && f.options.includes(v as string);
    if (f.type === 'boolean') valid = typeof v === 'boolean';
    if (f.type === 'number' || f.type === 'money')
      valid = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12;
    if (f.type === 'date')
      valid =
        typeof v === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v;
    if (!valid) throw Error(`Revisa el valor de «${f.label}».`);
  }
}
export function equipmentTemplate(): CustomModule {
  return {
    id: 'equipos',
    name: 'Equipos',
    description: 'Equipos de clientes y sus próximas revisiones.',
    icon: 'tool',
    enabled: true,
    permissions: {
      admin: ['read', 'create', 'edit', 'delete'],
      commercial: ['read', 'create', 'edit'],
      worker: [],
    },
    fields: [
      {
        id: 'serie',
        label: 'Número de serie',
        type: 'text',
        required: true,
        archived: false,
        options: [],
      },
      {
        id: 'cliente',
        label: 'Empresa cliente',
        type: 'company',
        required: false,
        archived: false,
        options: [],
      },
      {
        id: 'contacto',
        label: 'Contacto',
        type: 'contact',
        required: false,
        archived: false,
        options: [],
      },
      {
        id: 'responsable',
        label: 'Responsable',
        type: 'text',
        required: false,
        archived: false,
        options: [],
      },
      {
        id: 'revision',
        label: 'Próxima revisión',
        type: 'date',
        required: false,
        archived: false,
        options: [],
      },
      {
        id: 'estado',
        label: 'Estado',
        type: 'select',
        required: true,
        archived: false,
        options: ['Pendiente', 'En revisión', 'Terminado'],
      },
    ],
  };
}
