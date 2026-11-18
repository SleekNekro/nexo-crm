'use client';
import { useState } from 'react';
import { FormDialog } from './dialog';
import MailSettings from './mail-settings';
import type { Identity } from '../../application/access';
import type { Data } from '../../domain/model';
import type { WorkspaceBrand } from '../../domain/workspace';
import {
  settingsOrDefault,
  moduleNames,
  moduleDependencies,
  type BusinessSettings,
  type CustomField,
  type ModuleName,
} from '../../domain/business-settings';
const sections = [
  'Identidad',
  'Módulos',
  'Campos',
  'Etapas',
  'Automatizaciones',
  'Equipo y correo',
  'Empezar',
];
export default function BusinessSettingsDialog({
  user,
  data,
  onClose,
}: {
  user: Identity;
  data: Data;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<BusinessSettings>(() =>
    structuredClone(settingsOrDefault(user.workspace?.settings)),
  );
  const [brand, setBrand] = useState<WorkspaceBrand>(() => ({ ...user.workspace!.brand }));
  const [tab, setTab] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [mail, setMail] = useState(false);
  const occupied = !!(
    data.companies.length ||
    data.deals.length ||
    data.contacts.length ||
    data.works?.length
  );
  const [initialData, setInitialData] = useState(occupied ? 'keep' : 'empty');
  const [username, setUsername] = useState(''),
    [role, setRole] = useState('commercial'),
    [password, setPassword] = useState('');
  function update(next: BusinessSettings) {
    setConfig(next);
    setDirty(true);
  }
  function close() {
    if (!busy && (!dirty || confirm('¿Cerrar sin guardar la configuración?'))) onClose();
  }
  function toggleModule(name: ModuleName, on: boolean) {
    const selected = new Set(config.modules);
    const enable = (m: ModuleName) => {
      if (selected.has(m)) return;
      selected.add(m);
      for (const dep of moduleDependencies[m] || []) enable(dep);
    };
    if (on) enable(name);
    else {
      selected.delete(name);
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of selected)
          if ((moduleDependencies[m] || []).some((d) => !selected.has(d))) {
            selected.delete(m);
            changed = true;
          }
      }
    }
    update({
      ...config,
      modules: [...selected],
      automation: {
        ...config.automation,
        followUp: config.automation.followUp && selected.has('Actividades'),
      },
    });
  }
  function field(index: number, patch: Partial<CustomField>) {
    update({
      ...config,
      fields: config.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: { ...config, setupComplete: true },
          brand,
          version: user.workspace?.version,
          initialData: config.setupComplete ? 'keep' : initialData,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setDirty(false);
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <FormDialog title="Configuración del negocio" onClose={close}>
      <div className="business-settings">
        <h2>{config.setupComplete ? 'Configuración del negocio' : 'Vamos a preparar tu CRM'}</h2>
        <p>
          Configuración de esta empresa. Solo el desarrollador puede modificarla; se aplica a todo
          su equipo.
        </p>
        <nav className="settings-tabs" aria-label="Secciones de configuración">
          {sections.map((s, i) => (
            <button
              type="button"
              key={s}
              aria-current={tab === i ? 'step' : undefined}
              onClick={() => setTab(i)}
            >
              {i + 1}. {s}
            </button>
          ))}
        </nav>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <fieldset disabled={busy} className="settings-body">
          {tab === 0 && (
            <>
              <h3>Identidad de la empresa</h3>
              <div className="settings-grid">
                <label>
                  Nombre
                  <input
                    maxLength={80}
                    value={brand.name}
                    onChange={(e) => {
                      setBrand({ ...brand, name: e.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Moneda
                  <select
                    value={brand.currency || 'EUR'}
                    onChange={(e) => {
                      setBrand({
                        ...brand,
                        currency: e.target.value as WorkspaceBrand['currency'],
                      });
                      setDirty(true);
                    }}
                  >
                    {['EUR', 'USD', 'GBP'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {(['primary', 'accent', 'detail'] as const).map((k, i) => (
                  <label key={k}>
                    {['Color principal', 'Fondo suave', 'Detalles'][i]}
                    <input
                      type="color"
                      value={brand[k] || brand.primary}
                      onChange={(e) => {
                        setBrand({ ...brand, [k]: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
                <label>
                  Logo (PNG, JPG o WebP, hasta 180 KB)
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 180000) {
                        setError('El logo debe ocupar menos de 180 KB');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setBrand({ ...brand, logo: String(reader.result) });
                        setDirty(true);
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              </div>
              <details>
                <summary>Datos que aparecerán en los presupuestos</summary>
                <div className="settings-grid">
                  {(['legalName', 'taxId', 'address', 'phone', 'email', 'website'] as const).map(
                    (key, i) => (
                      <label key={key}>
                        {
                          [
                            'Razón social',
                            'CIF / NIF',
                            'Dirección',
                            'Teléfono',
                            'Correo de empresa',
                            'Web',
                          ][i]
                        }
                        <input
                          maxLength={2000}
                          value={brand[key]}
                          onChange={(e) => {
                            setBrand({ ...brand, [key]: e.target.value });
                            setDirty(true);
                          }}
                        />
                      </label>
                    ),
                  )}
                </div>
              </details>
              {brand.logo && (
                <img src={brand.logo} alt="Vista previa del logo" className="settings-logo" />
              )}
              <p>
                La moneda no convierte los importes. No se puede cambiar una vez emitidos
                presupuestos. Los documentos anteriores conservan su identidad.
              </p>
            </>
          )}
          {tab === 1 && (
            <>
              <h3>Solo las funciones que necesitas</h3>
              <p>
                Empresas, Mi día y Equipo forman la base. Activar un módulo activa sus dependencias;
                al quitar una dependencia se quitan los módulos que la necesitan. Los datos
                existentes se conservan.
              </p>
              <div className="settings-grid">
                {moduleNames.map((m) => (
                  <label className="settings-check" key={m}>
                    <input
                      type="checkbox"
                      checked={config.modules.includes(m)}
                      onChange={(e) => toggleModule(m, e.target.checked)}
                    />
                    <span>
                      {m}
                      {moduleDependencies[m]?.length ? (
                        <small>Necesita {moduleDependencies[m]!.join(', ')}</small>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          {tab === 2 && (
            <>
              <h3>Campos personalizados</h3>
              <p>
                Campos opcionales en empresas, contactos y tratos. Archiva un campo para ocultarlo
                sin perder sus valores.
              </p>
              {config.fields.map((f, i) => (
                <section className="settings-row" key={f.id}>
                  <div className="settings-grid">
                    <label>
                      Nombre
                      <input
                        value={f.label}
                        maxLength={80}
                        onChange={(e) => field(i, { label: e.target.value })}
                      />
                    </label>
                    <label>
                      Ficha
                      <select
                        value={f.entity}
                        onChange={(e) =>
                          field(i, { entity: e.target.value as CustomField['entity'] })
                        }
                      >
                        <option value="companies">Empresa</option>
                        <option value="contacts">Contacto</option>
                        <option value="deals">Trato</option>
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select
                        value={f.type}
                        onChange={(e) => field(i, { type: e.target.value as CustomField['type'] })}
                      >
                        <option value="text">Texto</option>
                        <option value="date">Fecha</option>
                        <option value="number">Número</option>
                        <option value="select">Desplegable</option>
                      </select>
                    </label>
                    {f.type === 'select' && (
                      <label>
                        Opciones (una por línea)
                        <textarea
                          value={f.options.join('\n')}
                          onChange={(e) => field(i, { options: e.target.value.split('\n') })}
                        />
                      </label>
                    )}
                  </div>
                  <label className="settings-check">
                    <input
                      type="checkbox"
                      checked={f.archived}
                      onChange={(e) => field(i, { archived: e.target.checked })}
                    />
                    Archivado
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      update({ ...config, fields: config.fields.filter((_, j) => j !== i) })
                    }
                  >
                    Quitar campo sin uso
                  </button>
                </section>
              ))}
              <button
                type="button"
                disabled={config.fields.length >= 30}
                onClick={() =>
                  update({
                    ...config,
                    fields: [
                      ...config.fields,
                      {
                        id: 'field_' + crypto.randomUUID(),
                        entity: 'companies',
                        type: 'text',
                        label: 'Nuevo campo',
                        options: [],
                        archived: false,
                      },
                    ],
                  })
                }
              >
                Añadir campo
              </button>
            </>
          )}
          {tab === 3 && (
            <>
              <h3>Etapas comerciales</h3>
              <p>
                Renombra y ordena las etapas. Puedes añadir fases abiertas de preparación o de
                espera. Ganado y Perdido conservan su significado para los pedidos y las
                estadísticas.
              </p>
              {config.phases.map((p, i) => (
                <section className="settings-row" key={p.id}>
                  <div className="settings-grid">
                    <label>
                      Nombre
                      <input
                        maxLength={60}
                        value={p.label}
                        onChange={(e) =>
                          update({
                            ...config,
                            phases: config.phases.map((v, j) =>
                              j === i ? { ...v, label: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Color
                      <input
                        type="color"
                        value={p.color}
                        onChange={(e) =>
                          update({
                            ...config,
                            phases: config.phases.map((v, j) =>
                              j === i ? { ...v, color: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                  <p>Significado: {p.kind}</p>
                  <div className="settings-actions">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const phases = [...config.phases];
                        [phases[i - 1], phases[i]] = [phases[i], phases[i - 1]];
                        update({ ...config, phases });
                      }}
                    >
                      Subir
                    </button>
                    <button
                      disabled={i === config.phases.length - 1}
                      onClick={() => {
                        const phases = [...config.phases];
                        [phases[i + 1], phases[i]] = [phases[i], phases[i + 1]];
                        update({ ...config, phases });
                      }}
                    >
                      Bajar
                    </button>
                    {!['preparation', 'waiting', 'won', 'lost'].includes(p.id) && (
                      <button
                        onClick={() =>
                          update({ ...config, phases: config.phases.filter((v) => v.id !== p.id) })
                        }
                      >
                        Quitar etapa sin uso
                      </button>
                    )}
                  </div>
                </section>
              ))}
              <div className="settings-actions">
                {(['En preparación', 'Pendiente del cliente'] as const).map((kind) => (
                  <button
                    key={kind}
                    disabled={config.phases.length >= 12}
                    onClick={() =>
                      update({
                        ...config,
                        phases: [
                          ...config.phases,
                          {
                            id: 'phase_' + crypto.randomUUID(),
                            kind,
                            label: 'Nueva etapa ' + (config.phases.length + 1),
                            color: '#2563eb',
                          },
                        ],
                      })
                    }
                  >
                    Añadir: {kind}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === 4 && (
            <>
              <h3>Reglas automáticas</h3>
              <p>
                Se ejecutan al producirse el evento, sin aplicar cambios retroactivos. No se envían
                correos automáticamente al cliente.
              </p>
              {(
                [
                  ['pendingOnSend', 'Al enviar un presupuesto, pasar a pendiente del cliente'],
                  ['followUp', 'Al enviar un presupuesto, crear un seguimiento'],
                  ['activateOnWin', 'Al ganar un trato, activar al posible cliente'],
                ] as const
              ).map(([key, label]) => (
                <label className="settings-check" key={key}>
                  <input
                    type="checkbox"
                    checked={config.automation[key]}
                    disabled={key === 'followUp' && !config.modules.includes('Actividades')}
                    onChange={(e) =>
                      update({
                        ...config,
                        automation: { ...config.automation, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
              {config.automation.followUp && (
                <div className="settings-grid">
                  <label>
                    Días laborables hasta el seguimiento
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={config.automation.followUpDays}
                      onChange={(e) =>
                        update({
                          ...config,
                          automation: {
                            ...config.automation,
                            followUpDays: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Título del seguimiento
                    <input
                      maxLength={150}
                      value={config.automation.followUpTitle}
                      onChange={(e) =>
                        update({
                          ...config,
                          automation: { ...config.automation, followUpTitle: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <p>
                La fecha sugerida puede ajustarse en cada envío. Ganar un trato solo activa empresas
                que eran posibles clientes; no reemplaza otros estados elegidos manualmente.
              </p>
            </>
          )}
          {tab === 5 && (
            <>
              <h3>Equipo y correo</h3>
              <p>
                Tu cuenta ya está lista. Puedes añadir ahora un administrador o comercial; los
                permisos detallados y operarios se gestionan desde Equipo.
              </p>
              <div className="settings-grid">
                <label>
                  Usuario
                  <input
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label>
                  Perfil
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="commercial">Comercial</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label>
                  Contraseña temporal (mínimo 12 caracteres)
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </div>
              <button
                disabled={!username || password.length < 12}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const r = await fetch('/api/users', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'create',
                        username,
                        role,
                        password,
                        profile: username,
                      }),
                    });
                    const b = await r.json();
                    if (!r.ok) throw Error(b.error);
                    setNotice('Cuenta creada. Pedirá una contraseña personal al entrar.');
                    setUsername('');
                    setPassword('');
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Crear cuenta ahora
              </button>
              <p>Esta acción se guarda inmediatamente, aunque cierres el asistente.</p>
              <h3>Correo de tu cuenta</h3>
              <p>
                Cada persona configura su propio remitente con las plantillas de proveedor
                disponibles.
              </p>
              <button onClick={() => setMail(true)}>Configurar mi correo</button>
            </>
          )}
          {tab === 6 && (
            <>
              <h3>{config.setupComplete ? 'Guardar cambios' : 'Cómo quieres empezar'}</h3>
              {!config.setupComplete && (
                <>
                  <label>
                    Datos iniciales
                    <select
                      value={initialData}
                      onChange={(e) => {
                        setInitialData(e.target.value);
                        setDirty(true);
                      }}
                    >
                      <option value="keep">Conservar los datos actuales</option>
                      <option value="empty" disabled={occupied}>
                        Empezar vacío
                      </option>
                      <option value="examples" disabled={occupied}>
                        Cargar ejemplos ficticios
                      </option>
                    </select>
                  </label>
                  {occupied && (
                    <p>
                      Ya hay registros: se conservarán. El asistente nunca vacía una instalación en
                      uso.
                    </p>
                  )}
                </>
              )}
              <p>
                {config.modules.length} módulos · {config.fields.filter((f) => !f.archived).length}{' '}
                campos activos · {config.phases.length} etapas.
              </p>
              <button className="primary" onClick={() => void save()}>
                {busy ? 'Guardando…' : 'Guardar y abrir mi CRM'}
              </button>
            </>
          )}
        </fieldset>
        <div className="settings-actions">
          <button disabled={busy || tab === 0} onClick={() => setTab(tab - 1)}>
            Anterior
          </button>
          {tab < sections.length - 1 && (
            <button disabled={busy} className="primary" onClick={() => setTab(tab + 1)}>
              Continuar
            </button>
          )}
          <button disabled={busy} onClick={close}>
            Cerrar
          </button>
        </div>
      </div>
      {mail && (
        <MailSettings
          displayName={user.displayName || user.username}
          onClose={() => setMail(false)}
        />
      )}
    </FormDialog>
  );
}
