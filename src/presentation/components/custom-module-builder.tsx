'use client';
import { useState } from 'react';
import { FormDialog } from './dialog';
import {
  equipmentTemplate,
  fieldTypes,
  moduleActions,
  moduleRoles,
  validateModule,
  type CustomModule,
} from '../../domain/custom-modules';
export const typeLabels = {
  text: 'Texto',
  number: 'Número',
  money: 'Importe',
  date: 'Fecha',
  select: 'Desplegable',
  boolean: 'Casilla',
  company: 'Empresa',
  contact: 'Contacto',
};
const roleLabels = { admin: 'Administración', commercial: 'Comerciales', worker: 'Operarios' };
const actionLabels = { read: 'Consultar', create: 'Crear', edit: 'Modificar', delete: 'Eliminar' };
export default function CustomModuleBuilder({
  initial,
  version,
  onClose,
  onSave,
}: {
  initial?: CustomModule;
  version: number;
  onClose: () => void;
  onSave: (m: CustomModule, v: number) => Promise<void>;
}) {
  const [module, setModule] = useState<CustomModule>(() =>
    initial
      ? structuredClone(initial)
      : {
          ...equipmentTemplate(),
          id: 'module_' + crypto.randomUUID(),
          name: 'Nuevo módulo',
          description: '',
          fields: [],
        },
  );
  const [step, setStep] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function update(m: CustomModule) {
    setModule(m);
    setDirty(true);
  }
  function close() {
    if (!busy && (!dirty || confirm('¿Volver sin guardar el módulo?'))) onClose();
  }
  async function publish() {
    setError('');
    try {
      validateModule(module);
      setBusy(true);
      await onSave(module, version);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog title="Creador de módulos" onClose={close}>
      <div className="custom-module-builder">
        <h2>{initial ? 'Configurar ' + initial.name : 'Crear un módulo sin programar'}</h2>
        <nav className="settings-tabs" aria-label="Pasos del creador">
          {['Identidad y campos', 'Permisos', 'Vista previa'].map((label, i) => (
            <button
              type="button"
              key={label}
              disabled={busy}
              aria-current={step === i ? 'step' : undefined}
              onClick={() => setStep(i)}
            >
              {i + 1}. {label}
            </button>
          ))}
        </nav>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <fieldset disabled={busy} className="settings-body">
          {step === 0 && (
            <>
              {!initial && (
                <div className="settings-actions">
                  <button
                    onClick={() => {
                      if (!dirty || confirm('¿Sustituir esta definición por la plantilla Equipos?'))
                        update({ ...equipmentTemplate(), id: module.id });
                    }}
                  >
                    Usar plantilla Equipos
                  </button>
                  <button
                    onClick={() => {
                      if (!dirty || confirm('¿Vaciar los campos de esta definición?'))
                        update({ ...module, name: 'Nuevo módulo', fields: [] });
                    }}
                  >
                    Empezar vacío
                  </button>
                </div>
              )}
              <div className="settings-grid">
                <label>
                  Nombre
                  <input
                    maxLength={60}
                    value={module.name}
                    onChange={(e) => update({ ...module, name: e.target.value })}
                  />
                </label>
                <label>
                  Icono
                  <select
                    value={module.icon}
                    onChange={(e) =>
                      update({ ...module, icon: e.target.value as CustomModule['icon'] })
                    }
                  >
                    <option value="box">Caja</option>
                    <option value="tool">Herramienta</option>
                    <option value="calendar">Calendario</option>
                  </select>
                </label>
                <label>
                  Descripción
                  <textarea
                    maxLength={500}
                    value={module.description}
                    onChange={(e) => update({ ...module, description: e.target.value })}
                  />
                </label>
              </div>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={module.enabled}
                  onChange={(e) => update({ ...module, enabled: e.target.checked })}
                />
                Módulo activado
              </label>
              <p>
                Desactivarlo oculta su menú y bloquea el acceso a los registros. Se conservan sus
                datos.
              </p>
              <h3>Campos de la ficha</h3>
              <p>
                Todos los registros tienen un nombre obligatorio. Puedes añadir hasta 20 campos y
                archivar los que ya no uses.
              </p>
              {module.fields.map((f, i) => {
                const patch = (value: Partial<typeof f>) =>
                  update({
                    ...module,
                    fields: module.fields.map((x, j) => (j === i ? { ...x, ...value } : x)),
                  });
                return (
                  <section className="settings-row" key={f.id}>
                    <div className="settings-grid">
                      <label>
                        Nombre del campo
                        <input
                          maxLength={60}
                          value={f.label}
                          onChange={(e) => patch({ label: e.target.value })}
                        />
                      </label>
                      <label>
                        Tipo
                        <select
                          value={f.type}
                          onChange={(e) =>
                            patch({
                              type: e.target.value as typeof f.type,
                              options:
                                e.target.value === 'select' ? ['Pendiente', 'Terminado'] : [],
                            })
                          }
                        >
                          {fieldTypes.map((t) => (
                            <option key={t} value={t}>
                              {typeLabels[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {f.type === 'select' && (
                        <label>
                          Opciones (una por línea)
                          <textarea
                            value={f.options.join('\n')}
                            onChange={(e) => patch({ options: e.target.value.split('\n') })}
                          />
                        </label>
                      )}
                    </div>
                    <div className="settings-actions">
                      <label className="settings-check">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => patch({ required: e.target.checked })}
                        />
                        Obligatorio
                      </label>
                      <label className="settings-check">
                        <input
                          type="checkbox"
                          checked={f.archived}
                          onChange={(e) => patch({ archived: e.target.checked })}
                        />
                        Archivado
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          update({ ...module, fields: module.fields.filter((x) => x.id !== f.id) })
                        }
                      >
                        Quitar campo sin uso
                      </button>
                    </div>
                  </section>
                );
              })}
              <button
                disabled={module.fields.length >= 20}
                onClick={() =>
                  update({
                    ...module,
                    fields: [
                      ...module.fields,
                      {
                        id: 'field_' + crypto.randomUUID(),
                        label: 'Nuevo campo',
                        type: 'text',
                        required: false,
                        archived: false,
                        options: [],
                      },
                    ],
                  })
                }
              >
                Añadir campo
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <h3>Quién puede utilizarlo</h3>
              <p>
                El desarrollador configura el módulo. Estos permisos permiten trabajar con sus
                registros en esta empresa; no dan acceso a datos de otras empresas. Las relaciones
                solo se muestran cuando el usuario puede consultar la empresa o el contacto
                relacionado.
              </p>
              {moduleRoles.map((role) => (
                <section className="settings-row" key={role}>
                  <h4>{roleLabels[role]}</h4>
                  <div className="settings-actions">
                    {moduleActions.map((action) => (
                      <label className="settings-check" key={action}>
                        <input
                          type="checkbox"
                          checked={module.permissions[role].includes(action)}
                          onChange={(e) => {
                            let rights = module.permissions[role].filter((a) => a !== action);
                            if (e.target.checked) {
                              rights.push(action);
                              if (!rights.includes('read')) rights.push('read');
                            } else if (action === 'read') rights = [];
                            update({
                              ...module,
                              permissions: { ...module.permissions, [role]: rights },
                            });
                          }}
                        />
                        {actionLabels[action]}
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
          {step === 2 && (
            <>
              <h3>Así se verá «{module.name}»</h3>
              <p>{module.description}</p>
              <div className="module-preview">
                <strong>Registro de ejemplo</strong>
                <dl>
                  {module.fields
                    .filter((f) => !f.archived)
                    .map((f) => (
                      <div key={f.id}>
                        <dt>
                          {f.label}
                          {f.required ? ' *' : ''}
                        </dt>
                        <dd>
                          {f.type === 'select'
                            ? f.options[0]
                            : f.type === 'boolean'
                              ? 'Sí'
                              : typeLabels[f.type] + ' de ejemplo'}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
              <p>
                Se creará una entrada en el menú, un listado con búsqueda y una ficha para cada
                registro. Esta vista previa no guarda registros.
              </p>
              <button className="primary" onClick={() => void publish()}>
                {busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Publicar módulo'}
              </button>
            </>
          )}
        </fieldset>
        <div className="settings-actions">
          <button disabled={busy || step === 0} onClick={() => setStep(step - 1)}>
            Anterior
          </button>
          {step < 2 && (
            <button className="primary" disabled={busy} onClick={() => setStep(step + 1)}>
              Continuar
            </button>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
