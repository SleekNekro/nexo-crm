'use client';
import { useState } from 'react';
import type { Identity } from '../../application/access';
import { FormDialog } from './dialog';
import SecuritySettings from './security-settings';
export default function Accounts({ user, onClose }: { user: Identity; onClose: () => void }) {
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
      <button onClick={onClose}>Cerrar</button>
      <h2>Mi cuenta · {user.username}</h2>
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
    </FormDialog>
  );
}
