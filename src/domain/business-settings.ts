import type { Data } from './model';
export const moduleNames = [
  'Contactos',
  'Tratos',
  'Presupuestos',
  'Pedidos',
  'Catálogo',
  'Actividades',
  'Obras',
  'Análisis',
] as const;
export type ModuleName = (typeof moduleNames)[number];
export type CustomField = {
  id: string;
  entity: 'companies' | 'contacts' | 'deals';
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  options: string[];
  archived: boolean;
};
export type PipelinePhase = {
  id: string;
  label: string;
  kind: 'En preparación' | 'Pendiente del cliente' | 'Ganado' | 'Perdido';
  color: string;
};
export type BusinessSettings = {
  setupComplete: boolean;
  modules: ModuleName[];
  fields: CustomField[];
  phases: PipelinePhase[];
  automation: {
    followUp: boolean;
    followUpDays: number;
    followUpTitle: string;
    pendingOnSend: boolean;
    activateOnWin: boolean;
  };
};
export const defaultSettings: BusinessSettings = {
  setupComplete: false,
  modules: [...moduleNames],
  fields: [],
  phases: [
    { id: 'preparation', label: 'En preparación', kind: 'En preparación', color: '#2563eb' },
    {
      id: 'waiting',
      label: 'Pendiente del cliente',
      kind: 'Pendiente del cliente',
      color: '#334155',
    },
    { id: 'won', label: 'Ganado', kind: 'Ganado', color: '#268750' },
    { id: 'lost', label: 'Perdido', kind: 'Perdido', color: '#dc2626' },
  ],
  automation: {
    followUp: true,
    followUpDays: 3,
    followUpTitle: 'Seguimiento del presupuesto',
    pendingOnSend: true,
    activateOnWin: true,
  },
};
export function settingsOrDefault(value?: BusinessSettings | null): BusinessSettings {
  return value || defaultSettings;
}
export const moduleDependencies: Partial<Record<ModuleName, ModuleName[]>> = {
  Presupuestos: ['Contactos', 'Tratos', 'Pedidos'],
  Pedidos: ['Presupuestos'],
  Actividades: ['Tratos'],
  Análisis: ['Contactos', 'Tratos', 'Presupuestos', 'Pedidos', 'Actividades'],
};
export function moduleEnabled(config: BusinessSettings | undefined, view: string) {
  return (
    !moduleNames.includes(view as ModuleName) ||
    settingsOrDefault(config).modules.includes(view as ModuleName)
  );
}
export function validateSettings(raw: unknown): asserts raw is BusinessSettings {
  const c = raw as BusinessSettings;
  if (
    !c ||
    typeof c !== 'object' ||
    typeof c.setupComplete !== 'boolean' ||
    !Array.isArray(c.modules) ||
    new Set(c.modules).size !== c.modules.length ||
    c.modules.some((m) => !moduleNames.includes(m))
  )
    throw Error('Módulos no válidos');
  for (const m of c.modules)
    for (const dep of moduleDependencies[m] || [])
      if (!c.modules.includes(dep)) throw Error(`${m} necesita ${dep}`);
  if (!Array.isArray(c.fields) || c.fields.length > 30)
    throw Error('Máximo 30 campos personalizados');
  const safeId = (id: unknown) =>
    typeof id === 'string' &&
    /^[a-z][a-z0-9_-]{0,59}$/.test(id) &&
    !['constructor', 'prototype', '__proto__'].includes(id);
  if (new Set(c.fields.map((f) => f.id)).size !== c.fields.length) throw Error('Campos repetidos');
  for (const f of c.fields)
    if (
      !safeId(f.id) ||
      !['companies', 'contacts', 'deals'].includes(f.entity) ||
      typeof f.label !== 'string' ||
      !f.label.trim() ||
      f.label.length > 80 ||
      !['text', 'date', 'number', 'select'].includes(f.type) ||
      typeof f.archived !== 'boolean' ||
      !Array.isArray(f.options) ||
      f.options.length > 50 ||
      f.options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 100) ||
      new Set(f.options).size !== f.options.length ||
      (f.type === 'select' && !f.options.length)
    )
      throw Error('Revisa los campos y sus opciones');
  if (
    !Array.isArray(c.phases) ||
    c.phases.length < 4 ||
    c.phases.length > 12 ||
    new Set(c.phases.map((p) => p.id)).size !== c.phases.length ||
    new Set(c.phases.map((p) => p.label.trim().toLowerCase())).size !== c.phases.length
  )
    throw Error('Define entre 4 y 12 etapas con nombres e identificadores únicos');
  for (const p of c.phases)
    if (
      !safeId(p.id) ||
      typeof p.label !== 'string' ||
      !p.label.trim() ||
      p.label.length > 60 ||
      !defaultSettings.phases.some((d) => d.kind === p.kind) ||
      !/^#[a-f0-9]{6}$/i.test(p.color)
    )
      throw Error('Etapa no válida');
  for (const p of defaultSettings.phases)
    if (!c.phases.some((x) => x.id === p.id && x.kind === p.kind))
      throw Error('Las cuatro etapas base deben conservar su significado');
  if (
    c.phases.filter((p) => p.kind === 'Ganado').length !== 1 ||
    c.phases.filter((p) => p.kind === 'Perdido').length !== 1
  )
    throw Error('Debe existir una sola etapa ganada y una perdida');
  const a = c.automation;
  if (
    !a ||
    ['followUp', 'pendingOnSend', 'activateOnWin'].some(
      (k) => typeof a[k as keyof typeof a] !== 'boolean',
    ) ||
    !Number.isInteger(a.followUpDays) ||
    a.followUpDays < 0 ||
    a.followUpDays > 90 ||
    typeof a.followUpTitle !== 'string' ||
    !a.followUpTitle.trim() ||
    a.followUpTitle.length > 150
  )
    throw Error('Automatización no válida');
}
export function phaseFor(deal: { stage: string; pipelinePhase?: string }, c = defaultSettings) {
  return (
    c.phases.find((p) => p.id === deal.pipelinePhase && p.kind === deal.stage) ||
    c.phases.find(
      (p) => p.id === defaultSettings.phases.find((base) => base.kind === deal.stage)?.id,
    )!
  );
}
export function validateConfigurationChange(
  before: BusinessSettings,
  next: BusinessSettings,
  data: Data,
) {
  validateSettings(next);
  if (before.setupComplete && !next.setupComplete)
    throw Error('La configuración inicial ya terminó');
  for (const field of before.fields) {
    const replacement = next.fields.find((f) => f.id === field.id);
    if (
      data[field.entity].some(
        (r) => r.customFields?.[field.id] !== undefined && r.customFields[field.id] !== '',
      )
    ) {
      if (!replacement || replacement.type !== field.type || replacement.entity !== field.entity)
        throw Error(
          `«${field.label}» tiene datos: archívalo en lugar de eliminarlo o cambiar su tipo`,
        );
      if (
        field.type === 'select' &&
        data[field.entity].some(
          (r) =>
            r.customFields?.[field.id] &&
            !replacement.options.includes(String(r.customFields[field.id])),
        )
      )
        throw Error(`Conserva las opciones utilizadas de «${field.label}»`);
    }
  }
  for (const phase of before.phases)
    if (
      data.deals.some((d) => phaseFor(d, before)?.id === phase.id) &&
      !next.phases.some((p) => p.id === phase.id && p.kind === phase.kind)
    )
      throw Error(`Mueve primero los tratos de «${phase.label}»`);
}
export function validateCustomData(data: Data, c: BusinessSettings) {
  for (const entity of ['companies', 'contacts', 'deals'] as const)
    for (const row of data[entity]) {
      if (row.customFields === undefined) continue;
      if (
        !row.customFields ||
        typeof row.customFields !== 'object' ||
        Array.isArray(row.customFields) ||
        Object.keys(row.customFields).length > 30
      )
        throw Error('Campos personalizados no válidos');
      for (const [id, value] of Object.entries(row.customFields)) {
        const f = c.fields.find((f) => f.id === id && f.entity === entity);
        if (!f || typeof value !== 'string' || value.length > 2000)
          throw Error('Campo personalizado desconocido o demasiado largo');
        if (value === '') continue;
        if (f.type === 'number' && (!Number.isFinite(Number(value)) || !value.trim()))
          throw Error(`«${f.label}» necesita un número`);
        if (
          f.type === 'date' &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString().slice(0, 10) !== value)
        )
          throw Error(`«${f.label}» necesita una fecha válida`);
        if (f.type === 'select' && !f.options.includes(value))
          throw Error(`Opción no válida para «${f.label}»`);
      }
    }
  for (const d of data.deals)
    if (d.pipelinePhase && !c.phases.some((p) => p.id === d.pipelinePhase && p.kind === d.stage))
      throw Error('La etapa seleccionada ya no está disponible');
}
