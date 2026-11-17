'use client';
import { useEffect, useState } from 'react';
import { FormDialog } from './dialog';
import { mailProviderHelp, type MailProvider } from '../../domain/mail-settings';
type Account = {
  provider_id: string;
  email: string;
  name: string;
  username: string;
  signature: string;
  host: string;
  port: number;
  security: string;
  version: number;
  verified_at: string | null;
  reminders_enabled: boolean;
};
export default function MailSettings({
  onClose,
  displayName,
}: {
  onClose: () => void;
  displayName: string;
}) {
  const [data, setData] = useState<{
    providers: MailProvider[];
    account: Account | null;
    defaultProvider: string;
    canManage: boolean;
    reminders: { subject: string; due: string; status: string; error?: string }[];
  } | null>(null);
  const [provider, setProvider] = useState('manual'),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    const r = await fetch('/api/mail-settings');
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setData(b);
    setProvider(b.account?.provider_id || b.defaultProvider);
    setDirty(false);
    return b;
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function action(payload: unknown, message: string, verify = false) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/mail-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      const saved = await load();
      if (verify) {
        const check = await fetch('/api/mail-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', version: saved.account.version }),
        });
        const result = await check.json();
        if (!check.ok) throw Error('Configuración guardada. ' + result.error);
        await load();
      }
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const account = data?.account;
  const help = mailProviderHelp[provider];
  const selectedProvider = data?.providers.find((p) => p.id === provider);
  function close() {
    if (!busy && (!dirty || confirm('Hay cambios de correo sin guardar. ¿Volver sin guardarlos?')))
      onClose();
  }
  return (
    <FormDialog title="Mi correo" onClose={close}>
      <h2>Mi correo</h2>
      <p>Tu buzón y tu firma para la empresa actual. Los demás usuarios configuran los suyos.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>Cargando configuración…</p>
      ) : (
        <>
          <p>
            <strong>
              {account?.verified_at
                ? 'Conexión comprobada'
                : account
                  ? 'Pendiente de comprobar'
                  : 'Sin correo conectado'}
            </strong>
          </p>
          <form
            key={account ? account.version + ':' + account.email : 'new'}
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action(
                {
                  action: 'save',
                  version: account?.version || 0,
                  providerId: provider,
                  email: f.get('email'),
                  name: String(f.get('name') || '').trim() || displayName,
                  password: f.get('password'),
                  signature: f.get('signature'),
                  username: f.get('username'),
                  host: f.get('host'),
                  port: Number(f.get('security') === 'starttls' ? 587 : 465),
                  security: f.get('security'),
                },
                'Correo conectado. No se ha enviado ningún mensaje.',
                true,
              );
            }}
          >
            <fieldset disabled={busy} className="mail-fields">
              <label>
                Proveedor
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {data.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option disabled value="outlook-oauth">
                    Outlook / Hotmail · OAuth2 pendiente
                  </option>
                  <option value="manual">Otro proveedor (manual)</option>
                </select>
              </label>
              {help && (
                <p role="note">
                  {help.text}{' '}
                  <a href={help.url} target="_blank" rel="noreferrer">
                    Ver instrucciones del proveedor ↗
                  </a>
                </p>
              )}
              <label>
                Tu correo
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  defaultValue={account?.email || ''}
                  autoComplete="email"
                />
              </label>
              <label>
                {help?.appPassword ? 'Contraseña de aplicación' : 'Contraseña del correo'}
                <input
                  name="password"
                  type="password"
                  maxLength={1024}
                  autoComplete="new-password"
                  placeholder={
                    account ? 'Guardada. Deja vacío para conservarla' : 'Contraseña del buzón'
                  }
                />
              </label>
              <p className="muted">
                Si cambias de correo o servidor, vuelve a introducir la contraseña. Nunca se muestra
                la contraseña guardada.
              </p>
              {provider === 'manual' && (
                <>
                  <label>
                    Servidor SMTP
                    <input
                      name="host"
                      required
                      defaultValue={account?.host || ''}
                      placeholder="smtp.proveedor.com"
                    />
                  </label>
                  <label>
                    Conexión
                    <select name="security" defaultValue={account?.security || 'tls'}>
                      <option value="tls">SSL/TLS · 465</option>
                      <option value="starttls">STARTTLS · 587</option>
                    </select>
                  </label>
                </>
              )}
              <details>
                <summary>Nombre y firma (opcional)</summary>
                <label>
                  Nombre del remitente
                  <input name="name" maxLength={120} defaultValue={account?.name || displayName} />
                </label>
                <label>
                  Firma
                  <textarea
                    name="signature"
                    maxLength={2000}
                    rows={3}
                    defaultValue={account?.signature || ''}
                    placeholder="Nombre, empresa y teléfono"
                  />
                </label>
              </details>
              <details>
                <summary>Opciones avanzadas</summary>
                {selectedProvider && (
                  <p className="muted">
                    {selectedProvider.host} · {selectedProvider.port} ·{' '}
                    {selectedProvider.security === 'tls' ? 'SSL/TLS' : 'STARTTLS'}
                  </p>
                )}

                <label>
                  Usuario SMTP
                  <input
                    name="username"
                    maxLength={254}
                    defaultValue={
                      account?.username === account?.email ? '' : account?.username || ''
                    }
                    placeholder="Por defecto, tu correo"
                  />
                </label>
              </details>
              <button className="primary" type="submit">
                {busy ? 'Comprobando…' : 'Guardar y comprobar'}
              </button>
            </fieldset>
          </form>
          <div className="mail-actions">
            {account && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm('¿Eliminar la configuración de tu correo en esta empresa?'))
                    action(
                      { action: 'disconnect', version: account.version },
                      'Correo desconectado.',
                    );
                }}
              >
                Desconectar correo
              </button>
            )}
          </div>

          <p className="muted">
            No se enviarán mensajes al comprobar la conexión. Para enviar, abre un presupuesto y
            pulsa «Enviar por correo».
          </p>
          {account && (
            <section className="mail-reminders">
              <h3>Recordatorios de actividades</h3>
              <label className="mail-reminder-toggle">
                <input
                  type="checkbox"
                  disabled={busy || dirty}
                  checked={account.reminders_enabled}
                  onChange={(e) =>
                    action(
                      { action: 'reminders', version: account.version, enabled: e.target.checked },
                      e.target.checked ? 'Recordatorios activados.' : 'Recordatorios desactivados.',
                    )
                  }
                />{' '}
                Avisarme por correo el día anterior
              </label>
              <p>
                A partir de las 9:00 (hora de España), en tu propio correo. Solo tus actividades
                pendientes. El servidor debe estar encendido y tu conexión de correo comprobada.
              </p>
              {!!data.reminders.length && (
                <details>
                  <summary>Últimos recordatorios</summary>
                  {data.reminders.map((r, i) => (
                    <div className="mail-history" key={i}>
                      <strong>{r.subject}</strong>
                      <p>
                        Actividad del {r.due} ·{' '}
                        {
                          (
                            {
                              sent: 'Enviado',
                              sending: 'En curso',
                              failed: 'No enviado',
                              unknown: 'Resultado sin confirmar',
                              skipped: 'Omitido porque cambió la actividad',
                            } as Record<string, string>
                          )[r.status]
                        }
                      </p>
                      {r.error && <p>{r.error}</p>}
                    </div>
                  ))}
                </details>
              )}
            </section>
          )}
          {data.canManage && (
            <details>
              <summary>Plantillas de la empresa · Desarrollador</summary>
              <p>
                Se reutilizan los datos de conexión, nunca las contraseñas. Las cuentas existentes
                conservan su configuración.
              </p>
              <label>
                Proveedor predeterminado
                <select
                  disabled={busy || dirty}
                  value={data.defaultProvider}
                  onChange={(e) =>
                    action(
                      { action: 'default', providerId: e.target.value },
                      'Proveedor predeterminado actualizado.',
                    )
                  }
                >
                  {data.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="manual">Manual</option>
                </select>
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  action(
                    {
                      action: 'provider',
                      name: f.get('name'),
                      host: f.get('host'),
                      security: f.get('security'),
                      port: f.get('security') === 'starttls' ? 587 : 465,
                    },
                    'Plantilla añadida. Ya está disponible para el equipo.',
                  );
                }}
              >
                <fieldset className="mail-fields" disabled={busy || dirty}>
                  <label>
                    Nombre de la plantilla
                    <input
                      name="name"
                      required
                      maxLength={100}
                      placeholder="Correo de la empresa"
                    />
                  </label>
                  <label>
                    Servidor SMTP
                    <input name="host" required maxLength={253} placeholder="smtp.proveedor.com" />
                  </label>
                  <label>
                    Conexión
                    <select name="security">
                      <option value="tls">SSL/TLS · 465</option>
                      <option value="starttls">STARTTLS · 587</option>
                    </select>
                  </label>
                  <button>Crear plantilla</button>
                </fieldset>
              </form>
            </details>
          )}
        </>
      )}
    </FormDialog>
  );
}
