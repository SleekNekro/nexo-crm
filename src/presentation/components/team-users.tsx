'use client';
import { useEffect, useRef, useState } from 'react';
import { PermissionForm, PermissionButton } from './permission-controls';
import AccountPermissionEditor from './account-permissions';
import { FormDialog } from './dialog';
import type { AccountPermissions } from '../../domain/permissions';
import { accountRemovalReason } from '../../domain/account-removal';
import type { Identity } from '../../application/access';
import type { Data, Worker } from '../../domain/model';
type Account = {
  id: string;
  username: string;
  display_name?: string;
  role: string;
  global_role?: string;
  profile: string;
  permissions?: AccountPermissions | null;
  active: boolean;
  must_change: boolean;
  external?: boolean;
  access_end?: string;
  access_until?: string;
};
const roles: Record<string, string> = {
  developer: 'Desarrollador',
  admin: 'Administrador',
  commercial: 'Comercial / responsable',
  worker: 'Operario',
};
const status = (a: Account) =>
  !a.active
    ? 'Desactivada'
    : a.access_until && new Date(a.access_until) <= new Date()
      ? 'Caducada'
      : 'Activa';
export default function TeamUsers({
  user,
  data,
  onWorkerAccess,
  onChanged,
  onDirty,
}: {
  user: Identity;
  data: Data;
  onWorkerAccess: (worker?: Worker) => void;
  onChanged: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [users, setUsers] = useState<Account[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todas'),
    [roleFilter, setRoleFilter] = useState('Todos');
  const [selectedId, setSelectedId] = useState(''),
    [creating, setCreating] = useState(false),
    [role, setRole] = useState('commercial');
  const [resetting, setResetting] = useState(false),
    [removing, setRemoving] = useState(false),
    [dirty, setDirty] = useState(false);
  const saving = useRef(false);
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
  async function load() {
    try {
      const r = await fetch('/api/users');
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setUsers(b.users);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function send(payload: unknown, message = 'Cambios guardados') {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await load();
      onChanged();
      setDirty(false);
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const selected = users.find((a) => a.id === selectedId);
  const close = () => {
    if (busy || (dirty && !confirm('¿Descartar los cambios sin guardar?'))) return;
    setSelectedId('');
    setCreating(false);
    setResetting(false);
    setRemoving(false);
    setDirty(false);
    setError('');
    return true;
  };
  const open = (a: Account) => {
    setSelectedId(a.id);
    setError('');
    setNotice('');
    setResetting(false);
    setRemoving(false);
    setDirty(false);
  };
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const shown = users.filter(
    (a) =>
      (filter === 'Todas' || status(a) === filter) &&
      (roleFilter === 'Todos' ||
        (a.global_role === 'developer' ? 'developer' : a.role) === roleFilter) &&
      normalize(`${a.username} ${a.display_name || ''} ${a.profile}`).includes(normalize(query)),
  );
  const linked = selected
    ? data.workers?.find((w) => 'operario:' + w.id === selected.profile)
    : undefined;
  const reason = selected ? accountRemovalReason(data, selected, user.id) : '';
  const editable =
    selected &&
    selected.id !== user.id &&
    ((selected.global_role || selected.role) !== 'developer' || user.platformDeveloper);
  return (
    <section className="team-accounts">
      <div className="heading">
        <div>
          <h1>Cuentas del equipo</h1>
          <p>Gestiona quién entra en esta empresa y qué puede hacer.</p>
        </div>
        <PermissionButton
          action="accounts"
          className="primary"
          onClick={() => {
            setCreating(true);
            setError('');
            setRole('commercial');
            setDirty(false);
          }}
        >
          Crear cuenta
        </PermissionButton>
      </div>
      <div className="teamfilters">
        <label>
          Buscar cuenta
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o usuario"
          />
        </label>
        <label>
          Estado
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['Todas', 'Activa', 'Desactivada', 'Caducada'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Perfil
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option>Todos</option>
            {Object.entries(roles).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && !selected && !creating && (
        <p className="error" role="alert">
          {error} <button onClick={() => void load()}>Reintentar</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="muted">
        {shown.length} cuentas · {users.filter((a) => status(a) === 'Activa').length} activas
      </p>
      <div className="account-directory">
        {shown.map((a) => (
          <button key={a.id} className="account-directory-row" onClick={() => open(a)}>
            <span>
              <strong>{a.display_name || a.username}</strong>
              <small>
                {a.username} · {roles[a.global_role === 'developer' ? 'developer' : a.role]}
              </small>
            </span>
            <span>
              <span className="badge">{status(a)}</span>
              <small>
                {a.permissions ? 'Permisos personalizados' : 'Permisos del perfil'}
                {a.external ? ' · Temporal' : ''}
                {a.must_change ? ' · Primer acceso pendiente' : ''}
              </small>
            </span>
            <span>Gestionar →</span>
          </button>
        ))}
      </div>
      {!shown.length && (
        <p className="empty">
          {loading ? 'Cargando cuentas…' : 'No hay cuentas que coincidan con los filtros.'}
        </p>
      )}
      {creating && (
        <FormDialog title="Crear cuenta" onClose={close}>
          <h2>Crear cuenta</h2>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <label>
            Tipo de cuenta
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(roles)
                .filter(([v]) => v !== 'developer' || user.platformDeveloper)
                .map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          {role === 'worker' ? (
            <>
              <p>
                Vincula la cuenta a una persona del equipo para conservar sus partes y asignaciones.
              </p>
              {(data.workers || [])
                .filter((w) => !w.archived)
                .map((w) => (
                  <button
                    className="full"
                    key={w.id}
                    onClick={() => {
                      setCreating(false);
                      onWorkerAccess(w);
                    }}
                  >
                    {w.name} · {w.kind === 'Subcontrata' ? 'Acceso temporal' : 'Gestionar acceso'}
                  </button>
                ))}
              <button
                className="full"
                onClick={() => {
                  setCreating(false);
                  onWorkerAccess();
                }}
              >
                Añadir persona al equipo
              </button>
              <button className="full" onClick={close}>
                Cancelar
              </button>
            </>
          ) : (
            <PermissionForm
              action="accounts"
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await send(
                    {
                      action: 'create',
                      role,
                      username: f.get('username'),
                      password: f.get('password'),
                    },
                    'Cuenta creada. La primera vez deberá elegir su contraseña.',
                  )
                )
                  setCreating(false);
              }}
            >
              <label>
                Usuario
                <input
                  required
                  name="username"
                  minLength={3}
                  maxLength={50}
                  pattern="[a-z0-9._\-]{3,50}"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  placeholder="nombre.apellido"
                />
              </label>
              <p className="muted">Minúsculas, números, puntos, guiones o guiones bajos.</p>
              <label>
                Contraseña temporal
                <input
                  required
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <p>Mínimo 12 caracteres. Se cambia al entrar por primera vez.</p>
              <div className="form-actions">
                <button type="button" disabled={busy} onClick={close}>
                  Cancelar
                </button>
                <PermissionButton action="accounts" className="primary" disabled={busy}>
                  {busy ? 'Creando…' : 'Crear cuenta'}
                </PermissionButton>
              </div>
            </PermissionForm>
          )}
        </FormDialog>
      )}
      {selected && (
        <FormDialog title={'Gestionar cuenta · ' + selected.username} onClose={close}>
          <div className="sectionhead">
            <h2>{selected.username}</h2>
            <button disabled={busy} onClick={close}>
              Cerrar
            </button>
          </div>
          <p>
            {roles[selected.global_role === 'developer' ? 'developer' : selected.role]} ·{' '}
            {status(selected)}
            {selected.external
              ? ' · Temporal hasta ' + String(selected.access_end || '').slice(0, 10)
              : ''}
          </p>
          <p className="muted">
            {selected.role === 'commercial'
              ? 'Ve su cartera y las obras asociadas.'
              : selected.role === 'worker'
                ? 'Ve sus obras asignadas y sus partes.'
                : 'Su perfil permite acceder a los datos de esta empresa.'}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {editable && selected.global_role === 'developer' && (
            <p>Desactivar esta cuenta de desarrollador bloquea su acceso a todas las empresas.</p>
          )}
          {editable && (
            <div className="form-actions">
              <PermissionButton
                action="accounts"
                disabled={busy}
                onClick={() =>
                  void send(
                    { action: 'active', id: selected.id, active: !selected.active },
                    selected.active
                      ? 'Acceso desactivado. Historial conservado.'
                      : 'Acceso activado.',
                  )
                }
              >
                {selected.active ? 'Desactivar acceso' : 'Activar acceso'}
              </PermissionButton>
              <button
                disabled={busy}
                onClick={() => {
                  setResetting(!resetting);
                  setRemoving(false);
                }}
              >
                Restablecer contraseña
              </button>
              {linked && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (close()) onWorkerAccess(linked);
                  }}
                >
                  Obras y acceso temporal
                </button>
              )}
            </div>
          )}
          {resetting && (
            <PermissionForm
              action="accounts"
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  await send(
                    { action: 'reset', id: selected.id, password: f.get('password') },
                    'Contraseña temporal guardada. Se han cerrado las sesiones.',
                  )
                )
                  setResetting(false);
              }}
            >
              <label>
                Nueva contraseña temporal
                <input
                  required
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <PermissionButton action="accounts" disabled={busy}>
                Guardar contraseña temporal
              </PermissionButton>
            </PermissionForm>
          )}
          {user.platformDeveloper && (selected.global_role || selected.role) !== 'developer' && (
            <AccountPermissionEditor
              key={selected.id + JSON.stringify(selected.permissions)}
              account={selected}
              busy={busy}
              onDirty={setDirty}
              onSave={(permissions) =>
                send(
                  { action: 'permissions', id: selected.id, permissions },
                  'Permisos guardados. Se aplicarán al volver a iniciar sesión.',
                )
              }
            />
          )}
          {!user.platformDeveloper && (
            <p>El desarrollador configura las vistas y acciones permitidas.</p>
          )}
          {editable && (selected.global_role || selected.role) !== 'developer' && (
            <details className="extra-fields">
              <summary>Eliminar cuenta de esta empresa</summary>
              <p>
                Conserva los partes y el historial. Si la cuenta pertenece a otras empresas,
                mantiene esos accesos. Si no, se elimina también su usuario de inicio de sesión.
              </p>
              {reason ? (
                <p role="status">{reason}</p>
              ) : (
                <>
                  <button className="danger" disabled={busy} onClick={() => setRemoving(true)}>
                    Eliminar cuenta…
                  </button>
                  {removing && (
                    <PermissionForm
                      action="accounts"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        if (f.get('confirm') !== selected.username) {
                          setError('Escribe el usuario exactamente para confirmar.');
                          return;
                        }
                        if (
                          await send(
                            { action: 'remove', id: selected.id },
                            'Cuenta eliminada de esta empresa. Historial conservado.',
                          )
                        )
                          setSelectedId('');
                      }}
                    >
                      <label>
                        Escribe {selected.username} para confirmar
                        <input name="confirm" required autoComplete="off" />
                      </label>
                      <PermissionButton action="accounts" className="danger" disabled={busy}>
                        Eliminar definitivamente
                      </PermissionButton>
                    </PermissionForm>
                  )}
                </>
              )}
            </details>
          )}
        </FormDialog>
      )}
    </section>
  );
}
