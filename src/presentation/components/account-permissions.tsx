'use client';
import { useState } from 'react';
import {
  actionLabels,
  availableActions,
  availableViews,
  type AccountPermissions,
} from '../../domain/permissions';
type Account = {
  id: string;
  username: string;
  role: string;
  permissions?: AccountPermissions | null;
};
export default function AccountPermissionEditor({
  account,
  busy,
  onSave,
  onDirty,
}: {
  account: Account;
  busy: boolean;
  onDirty?: (dirty: boolean) => void;
  onSave: (permissions: AccountPermissions | null) => Promise<boolean>;
}) {
  const defaults = () => ({
    views: availableViews(account.role),
    actions: availableActions(account.role),
  });
  const [value, setValue] = useState<AccountPermissions>(account.permissions || defaults());
  const toggle = (group: 'views' | 'actions', name: string) => {
    onDirty?.(true);
    setValue((v) => ({
      ...v,
      [group]: v[group].includes(name) ? v[group].filter((x) => x !== name) : [...v[group], name],
    }));
  };
  return (
    <details className="permission-editor">
      <summary>
        Vistas y permisos · {value.views.length} vistas · {value.actions.length} acciones
      </summary>
      <p>
        Las vistas restringen también la lectura de datos en fichas y documentos. Para consultar
        presupuestos y pedidos se necesitan Tratos, Presupuestos, Empresas y Contactos. Análisis
        requiere las vistas comerciales. El rol limita la cartera y las obras asignadas.
      </p>
      <div className="form-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue((v) => ({ ...v, actions: [] }));
            onDirty?.(true);
          }}
        >
          Solo consulta
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue(defaults());
            onDirty?.(true);
          }}
        >
          Seleccionar permisos del perfil
        </button>
      </div>
      <p className="muted">
        Ocultar una vista no revoca sus acciones: revisa ambos grupos. Solo consulta mantiene las
        vistas seleccionadas y desmarca todas las acciones.
      </p>
      <fieldset disabled={busy}>
        <legend>Vistas disponibles</legend>
        <div className="permission-options">
          {availableViews(account.role).map((name) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={value.views.includes(name)}
                onChange={() => toggle('views', name)}
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Acciones permitidas</legend>
        <div className="permission-options">
          {availableActions(account.role).map((name) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={value.actions.includes(name)}
                onChange={() => toggle('actions', name)}
              />
              {actionLabels[name as keyof typeof actionLabels]}
            </label>
          ))}
        </div>
      </fieldset>
      <p>Al guardar se cerrarán las sesiones de esta cuenta para aplicar los cambios.</p>
      <button className="primary" disabled={busy} onClick={() => void onSave(value)}>
        Guardar permisos
      </button>{' '}
      <button
        disabled={busy}
        onClick={async () => {
          if (await onSave(null)) setValue(defaults());
        }}
      >
        Restaurar permisos del rol
      </button>
    </details>
  );
}
