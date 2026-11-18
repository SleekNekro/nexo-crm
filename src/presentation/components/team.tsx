'use client';
import { useMoney } from '../hooks/use-business-settings';
import { useCanAction, PermissionForm, PermissionButton } from './permission-controls';
import { recordId } from '../utils/record-id';
import { useEffect, useState } from 'react';
import type { Identity } from '../../application/access';
import TeamUsers from './team-users';
import { archiveWorker, removeWorker, saveWorker } from '../../domain/labor';
import type { Data, Worker } from '../../domain/model';
import {} from '../../domain/model';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
type Account = {
  id: string;
  username: string;
  profile: string;
  active: boolean;
  external: boolean;
  access_end?: string;
  access_until?: string;
  work_scope?: string[];
};
const endDay = (value?: string) => value?.slice(0, 10) || '';
const endLabel = (value?: string) => {
  const day = endDay(value);
  return day ? day.split('-').reverse().join('/') : 'Sin fecha';
};
type Props = {
  user: Identity;
  data: Data;
  busy: boolean;
  onSave: (data: Data) => Promise<boolean | undefined>;
  onDirty: (dirty: boolean) => void;
  onWork: (id: string) => void;
};
export default function Team({ user, data, busy, onSave, onDirty, onWork }: Props) {
  const money = useMoney();
  const [accounts, setAccounts] = useState<Account[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [filter, setFilter] = useState('Todos'),
    [archivedView, setArchivedView] = useState(false),
    [query, setQuery] = useState(''),
    [worker, setWorker] = useState<Worker | null>(null),
    [selectedWorks, setSelectedWorks] = useState<string[]>([]),
    [person, setPerson] = useState<Worker | null>(null),
    [scope, setScope] = useState<string[]>([]),
    [renew, setRenew] = useState<Account | null>(null),
    [reset, setReset] = useState<Account | null>(null),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false);
  const canManageAccounts = useCanAction('accounts');
  const [section, setSection] = useState('accounts');
  const locked = busy || pending;
  async function load() {
    try {
      const r = await fetch('/api/users');
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setAccounts(b.users);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (canManageAccounts) void load();
  }, [canManageAccounts]);
  useEffect(() => {
    onDirty(dirty);
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      onDirty(false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty, onDirty]);
  function close() {
    if (locked) return;
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return;
    setWorker(null);
    setPerson(null);
    setRenew(null);
    setReset(null);
    setDirty(false);
    setError('');
  }
  function edit(w?: Worker) {
    setError('');
    setDirty(false);
    setWorker(
      w
        ? { ...w }
        : {
            id: recordId(),
            name: '',
            kind: filter === 'Subcontrata' ? 'Subcontrata' : 'Propio',
            company: '',
            rate: null,
          },
    );
    setSelectedWorks(
      w ? (data.works || []).filter((x) => x.workerIds?.includes(w.id)).map((x) => x.id) : [],
    );
  }
  function access(w: Worker) {
    setError('');
    setNotice('');
    setPerson(w);
    setScope((data.works || []).filter((x) => x.workerIds?.includes(w.id)).map((x) => x.id));
    setRenew(null);
    setReset(null);
    setDirty(false);
  }
  async function action(body: unknown) {
    setPending(true);
    setError('');
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await load();
      setDirty(false);
      setNotice('Acceso actualizado');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  async function remove(w: Worker) {
    setError('');
    setNotice('');
    try {
      const next = removeWorker(data, w.id, 'Dirección');
      if (
        !confirm(
          '¿Eliminar a ' +
            w.name +
            ' del equipo? Se eliminarán también sus cuentas de acceso y sus asignaciones a obras. Esta acción no se puede deshacer.',
        )
      )
        return;
      if (await onSave(next)) {
        await load();
        setNotice('Persona, cuentas y asignaciones eliminadas');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function archive(w: Worker) {
    const archived = !w.archived;
    if (
      !confirm(
        archived
          ? '¿Archivar a ' +
              w.name +
              '? Se conservarán sus partes y costes y se desactivarán sus cuentas.'
          : '¿Restaurar a ' +
              w.name +
              ' en Equipo? Sus cuentas seguirán desactivadas hasta que las actives.',
      )
    )
      return;
    if (await onSave(archiveWorker(data, w.id, archived, 'Dirección'))) {
      await load();
      setNotice(
        archived
          ? 'Persona archivada; historial conservado'
          : 'Persona restaurada; revisa sus asignaciones y su cuenta',
      );
    }
  }
  const workers = data.workers || [],
    activeWorkers = workers.filter((w) => !w.archived),
    visible = workers.filter(
      (w) =>
        !!w.archived === archivedView &&
        (filter === 'Todos' || w.kind === filter) &&
        (w.name + ' ' + w.company).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
  const assigned = (id: string) => (data.works || []).filter((w) => w.workerIds?.includes(id));
  const own = person ? accounts.filter((a) => a.profile === 'operario:' + person.id) : [];
  const state = (a: Account) =>
    !a.active
      ? 'Desactivada'
      : a.access_until && new Date(a.access_until) <= new Date()
        ? 'Caducada'
        : 'Activa';
  return (
    <div className="teamview">
      {canManageAccounts && (
        <div className="filtertabs" aria-label="Gestión del equipo">
          <button aria-pressed={section === 'accounts'} onClick={() => setSection('accounts')}>
            Cuentas y permisos
          </button>
          <button
            aria-pressed={section === 'people'}
            onClick={() => {
              if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return;
              setSection('people');
            }}
          >
            Operarios y subcontratas
          </button>
        </div>
      )}
      {canManageAccounts && section === 'accounts' && (
        <TeamUsers
          onDirty={setDirty}
          user={user}
          data={data}
          onChanged={() => void load()}
          onWorkerAccess={(w) => {
            setSection('people');
            if (w) access(w);
            else edit();
          }}
        />
      )}
      {(!canManageAccounts || section === 'people') && (
        <>
          <div className="heading">
            <div>
              <div className="eyebrow">PERSONAS Y ACCESOS</div>
              <h1>Equipo</h1>
              <p>
                Operarios propios y subcontratas, sus obras y accesos. Gestiona las cuentas
                temporales con «Crear cuenta» o «Gestionar cuenta» junto a cada persona.
              </p>
            </div>
            <PermissionButton
              action="team,works"
              className="primary"
              disabled={locked}
              onClick={() => edit()}
            >
              Añadir persona
            </PermissionButton>
          </div>
          <div className="metrics">
            <div className="metric">
              <span>Operarios propios</span>
              <strong>{activeWorkers.filter((w) => w.kind === 'Propio').length}</strong>
            </div>
            <div className="metric">
              <span>Personal externo</span>
              <strong>{activeWorkers.filter((w) => w.kind === 'Subcontrata').length}</strong>
            </div>
            <div className="metric">
              <span>Subcontratas</span>
              <strong>
                {
                  new Set(
                    activeWorkers
                      .filter((w) => w.kind === 'Subcontrata' && w.company.trim())
                      .map((w) => w.company.trim().toLocaleLowerCase()),
                  ).size
                }
              </strong>
            </div>
            <div className="metric">
              <span>Personas sin obra</span>
              <strong>{activeWorkers.filter((w) => !assigned(w.id).length).length}</strong>
            </div>
          </div>
          <div className="teamfilters">
            <label>
              Estado
              <select
                value={archivedView ? 'Archivados' : 'Activos'}
                onChange={(e) => setArchivedView(e.target.value === 'Archivados')}
              >
                <option>Activos</option>
                <option>Archivados</option>
              </select>
            </label>
            <label>
              Buscar persona o subcontrata
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre o empresa"
              />
            </label>
            <label>
              Mostrar
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option>Todos</option>
                <option>Propio</option>
                <option>Subcontrata</option>
              </select>
            </label>
          </div>
          {error && !worker && !person && <p className="error">{error}</p>}
          {notice && !person && <p role="status">{notice}</p>}
          {filter === 'Subcontrata' && (
            <div className="subcontractgroups">
              {[...new Set(visible.map((w) => w.company.trim() || 'Sin empresa'))]
                .sort()
                .map((name) => (
                  <button key={name} onClick={() => setQuery(name === 'Sin empresa' ? '' : name)}>
                    {name} ·{' '}
                    {visible.filter((w) => (w.company.trim() || 'Sin empresa') === name).length}{' '}
                    personas
                  </button>
                ))}
            </div>
          )}
          <section className="card tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Persona / Subcontrata</th>
                  <th>Coste por hora</th>
                  <th>Obras asignadas</th>
                  <th>Cuenta</th>
                  <th>Gestionar</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => {
                  const logins = accounts.filter((a) => a.profile === 'operario:' + w.id);
                  return (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.name}</strong>
                        <small>
                          {w.kind === 'Propio'
                            ? 'Equipo propio'
                            : w.company || 'Subcontrata sin nombre'}
                        </small>
                      </td>
                      <td>{w.rate === null ? 'Pendiente' : money(w.rate) + '/h'}</td>
                      <td>
                        <div className="teamworks">
                          {assigned(w.id).map((o) => (
                            <button className="recordlink" key={o.id} onClick={() => onWork(o.id)}>
                              {o.name}
                            </button>
                          ))}
                          {!assigned(w.id).length && <span>Sin obra asignada</span>}
                        </div>
                      </td>
                      <td>
                        {logins.length
                          ? logins.map((a) => (
                              <div key={a.id}>
                                <strong>{a.username}</strong>
                                <small>
                                  {state(a)}
                                  {a.external ? ' · hasta ' + endLabel(a.access_end) : ''}
                                </small>
                              </div>
                            ))
                          : 'Sin cuenta'}
                      </td>
                      <td>
                        <div className="teamactions">
                          <PermissionButton
                            action="team,works"
                            disabled={locked || !!w.archived}
                            onClick={() => edit(w)}
                          >
                            Datos y obras
                          </PermissionButton>
                          <PermissionButton
                            action="accounts"
                            disabled={locked || !!w.archived}
                            onClick={() => access(w)}
                          >
                            {logins.length ? 'Gestionar cuenta' : 'Crear cuenta'}
                          </PermissionButton>
                          <PermissionButton
                            action="team,works"
                            disabled={locked}
                            onClick={() => void archive(w)}
                          >
                            {w.archived ? 'Restaurar' : 'Archivar'}
                          </PermissionButton>
                          <PermissionButton
                            action="team,works"
                            className="danger"
                            disabled={locked}
                            onClick={() => void remove(w)}
                          >
                            Eliminar persona
                          </PermissionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length && (
              <p className="empty">
                No hay personas en esta vista. Puedes añadirlas con «Añadir persona».
              </p>
            )}
          </section>
          <p className="muted">
            Cada persona tiene su propio acceso. Las tarifas nuevas no cambian horas ya confirmadas.
            El personal externo solo accede a las obras autorizadas en su cuenta temporal.
          </p>

          {worker && (
            <FormDialog title="Persona y obras" onClose={close}>
              <button onClick={close} disabled={locked}>
                Cerrar
              </button>
              <h2>
                {workers.some((w) => w.id === worker.id) ? 'Datos y obras' : 'Añadir persona'}
              </h2>
              {error && <p className="error">{error}</p>}
              <PermissionForm
                action="team,works"
                onChange={() => setDirty(true)}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError('');
                  try {
                    if (worker.kind === 'Subcontrata' && !worker.company.trim())
                      throw Error('Indica la empresa subcontratada');
                    let n = saveWorker(
                      data,
                      {
                        ...worker,
                        name: worker.name.trim(),
                        company: worker.kind === 'Subcontrata' ? worker.company.trim() : '',
                      },
                      'Dirección',
                    );
                    for (const w of n.works || []) {
                      const ids = new Set(w.workerIds || []);
                      if (selectedWorks.includes(w.id)) ids.add(worker.id);
                      else ids.delete(worker.id);
                      w.workerIds = [...ids];
                    }
                    if (await onSave(n)) {
                      setDirty(false);
                      setWorker(null);
                      setNotice('Persona y asignaciones guardadas');
                    }
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  Nombre de la persona
                  <input
                    required
                    maxLength={150}
                    value={worker.name}
                    onChange={(e) => setWorker({ ...worker, name: e.target.value })}
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={worker.kind}
                    onChange={(e) =>
                      setWorker({ ...worker, kind: e.target.value as Worker['kind'] })
                    }
                  >
                    <option>Propio</option>
                    <option>Subcontrata</option>
                  </select>
                </label>
                {worker.kind === 'Subcontrata' && (
                  <label>
                    Empresa subcontratada
                    <input
                      required
                      maxLength={150}
                      value={worker.company}
                      onChange={(e) => setWorker({ ...worker, company: e.target.value })}
                    />
                  </label>
                )}
                <label>
                  Coste por hora (sin IVA)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Pendiente de definir"
                    value={worker.rate ?? ''}
                    onChange={(e) =>
                      setWorker({
                        ...worker,
                        rate: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <fieldset>
                  <legend>Obras asignadas</legend>
                  {(data.works || []).map((w) => (
                    <label className="assignment" key={w.id}>
                      <input
                        type="checkbox"
                        checked={selectedWorks.includes(w.id)}
                        onChange={(e) =>
                          setSelectedWorks(
                            e.target.checked
                              ? [...selectedWorks, w.id]
                              : selectedWorks.filter((id) => id !== w.id),
                          )
                        }
                      />
                      {w.name}
                    </label>
                  ))}
                  {!data.works?.length && (
                    <p>Aún no hay obras. Puedes guardar la persona y asignarla después.</p>
                  )}
                </fieldset>
                <p className="muted">
                  Retirar una asignación conserva los partes anteriores. Para una cuenta temporal,
                  revisa también sus obras autorizadas en «Gestionar cuenta».
                </p>
                <PermissionButton action="team,works" className="primary full" disabled={locked}>
                  {locked ? 'Guardando…' : 'Guardar persona y obras'}
                </PermissionButton>
              </PermissionForm>
            </FormDialog>
          )}
          {person && (
            <FormDialog title="Cuenta de la persona" onClose={close}>
              <button onClick={close} disabled={locked}>
                Cerrar
              </button>
              <h2>Acceso de {person.name}</h2>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {notice && <p role="status">{notice}</p>}
              {own.map((a) => (
                <section className="teamaccount" key={a.id}>
                  <strong>
                    {a.username} · {state(a)}
                  </strong>
                  <p>
                    {a.external ? 'Temporal hasta ' + endLabel(a.access_end) : 'Acceso de operario'}
                  </p>
                  <div className="teamactions">
                    <PermissionButton
                      action="accounts"
                      disabled={locked}
                      onClick={() => {
                        setReset(a);
                        setRenew(null);
                        setDirty(false);
                      }}
                    >
                      Restablecer contraseña
                    </PermissionButton>
                    <PermissionButton
                      action="accounts"
                      disabled={locked}
                      onClick={() => {
                        if (
                          confirm(
                            (a.active ? 'Desactivar' : 'Activar') +
                              ' el acceso de ' +
                              person.name +
                              '?',
                          )
                        )
                          void action({ action: 'active', id: a.id, active: !a.active });
                      }}
                    >
                      {a.active ? 'Desactivar' : 'Activar'}
                    </PermissionButton>
                    {a.external && (
                      <PermissionButton
                        action="accounts"
                        disabled={locked}
                        onClick={() => {
                          setRenew(a);
                          setReset(null);
                          setScope(
                            (a.work_scope || []).filter((id) =>
                              assigned(person.id).some((w) => w.id === id),
                            ),
                          );
                          setDirty(false);
                        }}
                      >
                        Vigencia y obras
                      </PermissionButton>
                    )}
                  </div>
                </section>
              ))}
              {reset ? (
                <PermissionForm
                  action="accounts"
                  onChange={() => setDirty(true)}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      await action({ action: 'reset', id: reset.id, password: f.get('password') })
                    )
                      setReset(null);
                  }}
                >
                  <h3>Nueva contraseña temporal</h3>
                  <label>
                    Contraseña (mínimo 12 caracteres)
                    <input
                      required
                      type="password"
                      name="password"
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <PermissionButton action="accounts" className="primary full" disabled={locked}>
                    Restablecer y cerrar sus sesiones
                  </PermissionButton>
                </PermissionForm>
              ) : (
                (!own.length || renew) && (
                  <PermissionForm
                    action="accounts"
                    key={renew?.id || person.id}
                    onChange={() => setDirty(true)}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const payload = renew
                        ? { action: 'temporary', id: renew.id, end: f.get('end'), scope }
                        : {
                            action: 'create',
                            username: f.get('username'),
                            password: f.get('password'),
                            role: 'worker',
                            profile: 'operario:' + person.id,
                            external: person.kind === 'Subcontrata',
                            end: f.get('end'),
                            scope,
                          };
                      if (await action(payload)) {
                        setRenew(null);
                        setNotice('Cuenta guardada. Entrega la contraseña solo a esta persona.');
                      }
                    }}
                  >
                    <h3>
                      {renew
                        ? 'Renovar y autorizar obras'
                        : person.kind === 'Subcontrata'
                          ? 'Crear cuenta temporal'
                          : 'Crear cuenta de operario'}
                    </h3>
                    {!renew && (
                      <>
                        <label>
                          Usuario
                          <input
                            required
                            name="username"
                            pattern="[a-z0-9._\-]{3,50}"
                            autoComplete="off"
                            placeholder="nombre.apellido"
                          />
                        </label>
                        <label>
                          Contraseña temporal
                          <input
                            required
                            type="password"
                            name="password"
                            minLength={12}
                            maxLength={128}
                            autoComplete="new-password"
                          />
                        </label>
                      </>
                    )}
                    {(person.kind === 'Subcontrata' || renew) && (
                      <>
                        <label>
                          Último día con acceso
                          <input
                            required
                            type="date"
                            name="end"
                            min={localDay()}
                            defaultValue={endDay(renew?.access_end)}
                          />
                        </label>
                        <fieldset>
                          <legend>Obras autorizadas para esta cuenta</legend>
                          {assigned(person.id).map((w) => (
                            <label className="assignment" key={w.id}>
                              <input
                                type="checkbox"
                                checked={scope.includes(w.id)}
                                onChange={(e) =>
                                  setScope(
                                    e.target.checked
                                      ? [...scope, w.id]
                                      : scope.filter((id) => id !== w.id),
                                  )
                                }
                              />
                              {w.name}
                            </label>
                          ))}
                          {!assigned(person.id).length && (
                            <p>Asigna primero una obra desde «Datos y obras».</p>
                          )}
                        </fieldset>
                      </>
                    )}
                    <p className="muted">
                      La primera vez elegirá su contraseña personal. No tendrá acceso a costes ni
                      tarifas.
                    </p>
                    <PermissionButton
                      action="accounts"
                      className="primary full"
                      disabled={
                        locked || ((person.kind === 'Subcontrata' || !!renew) && !scope.length)
                      }
                    >
                      {locked ? 'Guardando…' : renew ? 'Renovar acceso' : 'Crear cuenta'}
                    </PermissionButton>
                  </PermissionForm>
                )
              )}
            </FormDialog>
          )}
        </>
      )}
    </div>
  );
}
