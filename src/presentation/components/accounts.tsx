'use client';
import { useState, useEffect } from 'react';
import { Mail, LogOut } from 'lucide-react';
import MailSettings from './mail-settings';
import { canAct } from '../../domain/permissions';
import type { Identity } from '../../application/access';
import { FormDialog } from './dialog';
import SecuritySettings from './security-settings';
export default function Accounts({
  user,
  onClose,
  onLogout,
}: {
  user: Identity;
  onClose: () => void;
  onLogout: () => Promise<void>;
}) {
  const [sharedDevice, setSharedDevice] = useState(false);
  useEffect(() => {
    setSharedDevice(localStorage.getItem('crm-shared-device') === '1');
  }, []);
  const [mailOpen, setMailOpen] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  async function send(url: string, payload: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setNotice('Cambios guardados');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog title="Mi cuenta" onClose={onClose}>
      <h2>Mi cuenta · {user.username}</h2>
      <label className="check-row">
        <input
          type="checkbox"
          checked={sharedDevice}
          onChange={(e) => {
            setSharedDevice(e.target.checked);
            localStorage.setItem('crm-shared-device', e.target.checked ? '1' : '0');
          }}
        />
        Dispositivo compartido: eliminar borradores y fotos sin enviar al cerrar sesión
      </label>
      {canAct(user, 'deals') && (
        <button className="primary icon-action" type="button" onClick={() => setMailOpen(true)}>
          <Mail size={18} aria-hidden="true" /> Configurar mi correo
        </button>
      )}
      {mailOpen && (
        <MailSettings
          displayName={user.displayName || user.username}
          onClose={() => setMailOpen(false)}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          if (
            await send('/api/auth', {
              action: 'password',
              currentPassword: f.get('currentPassword'),
              password: f.get('password'),
              code: f.get('code'),
            })
          )
            form.reset();
        }}
      >
        <label>
          Contraseña actual
          <input
            required
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
        </label>
        <label>
          Nueva contraseña
          <input
            required
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Código de verificación, si tienes dos pasos
          <input name="code" autoComplete="one-time-code" maxLength={80} />
        </label>
        <button disabled={busy}>Cambiar contraseña</button>
      </form>
      <SecuritySettings />
      <section className="account-session">
        <h3>Sesión en este dispositivo</h3>
        <button
          type="button"
          className="icon-action"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onLogout();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={18} aria-hidden="true" />
          {busy ? 'Espera…' : 'Cerrar sesión'}
        </button>
      </section>
    </FormDialog>
  );
}
