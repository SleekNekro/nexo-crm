'use client';
import { useEffect, useState } from 'react';
export default function SecuritySettings() {
  const [status, setStatus] = useState<{
      enabled: boolean;
      remaining: number;
      sessions: number;
    } | null>(null),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [secret, setSecret] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const r = await fetch('/api/security');
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setStatus(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(action: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, password, code }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      if (b.secret) setSecret(b.secret);
      else {
        setSecret('');
        setPassword('');
        setCode('');
        if (b.codes) setCodes(b.codes);
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="securitysettings">
      <h2>Seguridad de acceso</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <>
          <p>
            Verificación en dos pasos:{' '}
            <strong>{status.enabled ? 'Activada' : 'Sin activar'}</strong>.{' '}
            {status.enabled && `${status.remaining} códigos de recuperación disponibles.`}
          </p>
          <p>
            Sesiones activas: {status.sessions}. Caducan tras 2 horas sin actividad o, como máximo,
            a las 12 horas.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              if (!confirm('Se cerrará también esta sesión. ¿Cerrar todas las sesiones?')) return;
              setBusy(true);
              try {
                const r = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'logoutAll' }),
                });
                if (!r.ok) throw Error('No se han podido cerrar las sesiones');
                sessionStorage.clear();
                location.reload();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Cerrar todas mis sesiones
          </button>
          {codes.length > 0 ? (
            <div className="recoverycodes">
              <h3>Guarda estos códigos de recuperación</h3>
              <p>
                Si pierdes el móvil, cada código permite entrar una sola vez. No volverán a
                mostrarse. Guárdalos en un lugar privado.
              </p>
              <pre>{codes.join('\n')}</pre>
              <button
                onClick={() => {
                  const blob = new Blob(
                    [
                      'NEXO · Códigos de recuperación\nCada código solo se puede usar una vez.\n\n' +
                        codes.join('\n'),
                    ],
                    { type: 'text/plain' },
                  );
                  const url = URL.createObjectURL(blob),
                    a = document.createElement('a');
                  a.href = url;
                  a.download = 'nexo-codigos-recuperacion.txt';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Descargar códigos
              </button>
              <button
                onClick={() => {
                  if (confirm('¿Has guardado los códigos en un lugar privado?')) setCodes([]);
                }}
              >
                Ya los he guardado
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (status.enabled && !confirm('¿Desactivar la verificación en dos pasos?')) return;
                void act(status.enabled ? 'disable' : secret ? 'enable' : 'setup');
              }}
            >
              <h3>{status.enabled ? 'Desactivar dos pasos' : 'Activar dos pasos'}</h3>
              <p>
                {status.enabled
                  ? 'Introduce tu contraseña y un código nuevo de tu app o un código de recuperación.'
                  : 'Añade una segunda comprobación con tu app de autenticación. No se envían SMS ni datos a servicios externos.'}
              </p>
              <label>
                Tu contraseña
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {secret && (
                <>
                  <p>
                    En tu app, añade una cuenta con clave manual. Nombre: NEXO. Tipo: basado en
                    tiempo (TOTP). Esta clave caduca aquí en 10 minutos.
                  </p>
                  <label>
                    Clave para tu app
                    <input readOnly value={secret} onFocus={(e) => e.target.select()} />
                  </label>
                  <p>Introduce el código de 6 cifras que muestra la app para confirmar.</p>
                </>
              )}
              {(secret || status.enabled) && (
                <label>
                  {status.enabled ? 'Código de la app o de recuperación' : 'Código de 6 cifras'}
                  <input
                    required
                    autoComplete="one-time-code"
                    value={code}
                    maxLength={80}
                    onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                  />
                </label>
              )}
              <button disabled={busy}>
                {busy
                  ? 'Comprobando…'
                  : status.enabled
                    ? 'Desactivar dos pasos'
                    : secret
                      ? 'Confirmar activación'
                      : 'Preparar activación'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
