'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Wrench, CalendarDays, Plus } from 'lucide-react';
import { FormDialog } from './dialog';
import CustomModuleBuilder from './custom-module-builder';
import { canUseModule, type CustomModule, type ModuleRecord } from '../../domain/custom-modules';
import type { Identity } from '../../application/access';

type Definition = { definition: CustomModule; version: number };
type Loaded = Definition & {
  records: ModuleRecord[];
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  limited: boolean;
};
const icons = { box: Box, tool: Wrench, calendar: CalendarDays };
export default function CustomModules({
  user,
  onEnter,
}: {
  user: Identity;
  onEnter: () => boolean;
}) {
  const [modules, setModules] = useState<Definition[]>([]),
    [selected, setSelected] = useState(''),
    [manager, setManager] = useState(false),
    [builder, setBuilder] = useState<Definition | null | undefined>(undefined),
    [error, setError] = useState('');
  async function load() {
    try {
      const r = await fetch('/api/custom-modules');
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setModules(b.modules);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [user.workspaceId]);
  async function post(payload: unknown) {
    const r = await fetch('/api/custom-modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-crm-workspace': user.workspaceId! },
      body: JSON.stringify(payload),
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
  }
  const overlay = (
    <>
      {manager && (
        <FormDialog title="Mis módulos" onClose={() => setManager(false)}>
          <h2>Mis módulos</h2>
          <p>Crea tus propias fichas sin programar. Desactivar un módulo conserva sus registros.</p>
          <button className="primary" onClick={() => setBuilder(null)}>
            Crear módulo
          </button>
          {modules.map((m) => (
            <section className="settings-row" key={m.definition.id}>
              <h3>{m.definition.name}</h3>
              <p>{m.definition.enabled ? 'Activo' : 'Desactivado'}</p>
              <button onClick={() => setBuilder(m)}>Configurar</button>
            </section>
          ))}
        </FormDialog>
      )}
      {builder !== undefined && (
        <CustomModuleBuilder
          key={builder?.definition.id || 'new'}
          initial={builder?.definition}
          version={builder?.version || 0}
          onClose={() => setBuilder(undefined)}
          onSave={async (m, v) => {
            await post({ action: 'definition', definition: m, version: v });
            setBuilder(undefined);
            await load();
            if (m.enabled) {
              setManager(false);
              setSelected(m.id);
            }
          }}
        />
      )}
      {selected && (
        <ModulePanel
          key={selected}
          id={selected}
          user={user}
          post={post}
          onClose={() => setSelected('')}
        />
      )}
    </>
  );
  return (
    <>
      {modules
        .filter((m) => canUseModule(m.definition, user.role, 'read'))
        .map((m) => {
          const Icon = icons[m.definition.icon];
          return (
            <button
              key={m.definition.id}
              onClick={() => {
                if (onEnter()) setSelected(m.definition.id);
              }}
            >
              <Icon size={18} />
              {m.definition.name}
            </button>
          );
        })}
      {user.platformDeveloper && (
        <button
          onClick={() => {
            if (onEnter()) setManager(true);
          }}
        >
          <Plus size={18} />
          Crear y gestionar módulos
        </button>
      )}
      {error && (
        <small role="status">
          {error} <button onClick={() => void load()}>Reintentar</button>
        </small>
      )}
      {typeof document !== 'undefined' && createPortal(overlay, document.body)}
    </>
  );
}
function ModulePanel({
  id,
  user,
  post,
  onClose,
}: {
  id: string;
  user: Identity;
  post: (p: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [record, setRecord] = useState<ModuleRecord | null | undefined>(undefined),
    [busy, setBusy] = useState(false);
  async function load() {
    setError('');
    try {
      const r = await fetch('/api/custom-modules?module=' + encodeURIComponent(id));
      const b = await r.json();
      if (!r.ok) {
        setLoaded(null);
        throw Error(b.error);
      }
      setLoaded(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  const m = loaded?.definition;
  const label = (f: CustomModule['fields'][number], v: unknown) => {
    if (v === undefined || v === '') return '—';
    if (f.type === 'boolean') return v ? 'Sí' : 'No';
    if (f.type === 'company' || f.type === 'contact')
      return (
        (f.type === 'company' ? loaded?.companies : loaded?.contacts)?.find((x) => x.id === v)
          ?.name || 'Referencia no disponible'
      );
    if (f.type === 'money')
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: user.workspace?.brand.currency || 'EUR',
      }).format(Number(v));
    return String(v);
  };
  const rows =
    loaded?.records.filter((r) =>
      [
        r.title,
        ...(m?.fields.filter((f) => !f.archived).map((f) => label(f, r.values[f.id])) || []),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    ) || [];
  return (
    <FormDialog
      title={m?.name || 'Módulo'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="custom-module-panel">
        <h2>{m?.name || 'Cargando módulo…'}</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loaded && m && (
          <>
            <p>{m.description}</p>
            <div className="module-list-actions">
              <label>
                Buscar registros
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre o cualquier campo"
                />
              </label>
              <button onClick={() => void load()}>Actualizar</button>
              {canUseModule(m, user.role, 'create') && (
                <button className="primary" onClick={() => setRecord(null)}>
                  Añadir registro
                </button>
              )}
            </div>
            <p>
              {rows.length} registros{loaded.limited ? ' · Se muestran los 1000 más recientes' : ''}
            </p>
            {!rows.length && (
              <p>
                No hay registros.{' '}
                {canUseModule(m, user.role, 'create') ? 'Añade el primero para empezar.' : ''}
              </p>
            )}
            <div className="custom-record-list">
              {rows.map((r) => (
                <button className="custom-record-card" key={r.id} onClick={() => setRecord(r)}>
                  <strong>{r.title}</strong>
                  {m.fields
                    .filter((f) => !f.archived)
                    .slice(0, 3)
                    .map((f) => (
                      <span key={f.id}>
                        {f.label}: {label(f, r.values[f.id])}
                      </span>
                    ))}
                  <span>Ver ficha →</span>
                </button>
              ))}
            </div>
            {record !== undefined && (
              <RecordEditor
                key={record?.id || 'new'}
                module={m}
                record={record}
                loaded={loaded}
                role={user.role}
                label={label}
                onClose={() => setRecord(undefined)}
                onSave={async (title, values) => {
                  setBusy(true);
                  try {
                    await post({
                      action: 'record',
                      moduleId: id,
                      moduleVersion: loaded.version,
                      id: record?.id,
                      version: record?.version,
                      title,
                      values,
                    });
                    setRecord(undefined);
                    await load();
                  } finally {
                    setBusy(false);
                  }
                }}
                onDelete={async () => {
                  setBusy(true);
                  try {
                    await post({
                      action: 'delete',
                      moduleId: id,
                      moduleVersion: loaded.version,
                      id: record?.id,
                      version: record?.version,
                    });
                    setRecord(undefined);
                    await load();
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </>
        )}
      </div>
    </FormDialog>
  );
}
function RecordEditor({
  module: m,
  record,
  loaded,
  role,
  label,
  onClose,
  onSave,
  onDelete,
}: {
  module: CustomModule;
  record: ModuleRecord | null;
  loaded: Loaded;
  role: string;
  label: (f: CustomModule['fields'][number], v: unknown) => string;
  onClose: () => void;
  onSave: (title: string, values: ModuleRecord['values']) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(record?.title || ''),
    [values, setValues] = useState<ModuleRecord['values']>(
      record?.values ||
        Object.fromEntries(
          m.fields.filter((f) => f.type === 'boolean' && !f.archived).map((f) => [f.id, false]),
        ),
    ),
    [editing, setEditing] = useState(!record),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const fields = m.fields.filter((f) => !f.archived);
  function close() {
    if (!busy && (!dirty || confirm('¿Volver sin guardar los cambios?'))) onClose();
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <FormDialog title={record?.title || 'Nuevo registro'} onClose={close}>
      <div className="custom-record-editor">
        <h2>{record?.title || 'Nuevo registro'}</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!editing ? (
          <>
            <dl>
              {fields.map((f) => (
                <div key={f.id}>
                  <dt>{f.label}</dt>
                  <dd>{label(f, values[f.id])}</dd>
                </div>
              ))}
            </dl>
            <div className="settings-actions">
              {canUseModule(m, role, 'edit') && (
                <button className="primary" onClick={() => setEditing(true)}>
                  Editar registro
                </button>
              )}
              {canUseModule(m, role, 'delete') && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm('¿Eliminar este registro? Dejará de aparecer en el módulo.'))
                      return;
                    setBusy(true);
                    try {
                      await onDelete();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Eliminar registro
                </button>
              )}
            </div>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await onSave(title, values);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="settings-body">
              <label>
                Nombre *
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              {fields.map((f) => {
                const change = (v: string | number | boolean) => {
                  setValues({ ...values, [f.id]: v });
                  setDirty(true);
                };
                let options =
                  f.type === 'company'
                    ? loaded.companies
                    : f.type === 'contact'
                      ? loaded.contacts
                      : f.options.map((v) => ({ id: v, name: v }));
                return (
                  <label key={f.id}>
                    {f.label}
                    {f.required ? ' *' : ''}
                    {f.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={values[f.id] === true}
                        onChange={(e) => change(e.target.checked)}
                      />
                    ) : ['select', 'company', 'contact'].includes(f.type) ? (
                      <select
                        required={f.required}
                        value={String(values[f.id] ?? '')}
                        onChange={(e) => change(e.target.value)}
                      >
                        <option value="">Selecciona…</option>
                        {values[f.id] && !options.some((o) => o.id === values[f.id]) && (
                          <option value={String(values[f.id])}>
                            Referencia no disponible (conservar)
                          </option>
                        )}
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        required={f.required}
                        type={
                          f.type === 'date'
                            ? 'date'
                            : ['number', 'money'].includes(f.type)
                              ? 'number'
                              : 'text'
                        }
                        step={f.type === 'money' ? '0.01' : 'any'}
                        maxLength={4000}
                        value={String(values[f.id] ?? '')}
                        onChange={(e) =>
                          change(
                            ['number', 'money'].includes(f.type) && e.target.value !== ''
                              ? Number(e.target.value)
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </label>
                );
              })}
              <button className="primary" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar registro'}
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </FormDialog>
  );
}
