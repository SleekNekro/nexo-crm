'use client';
import { configureWorkspace, bindWorkspaceFetch } from '../utils/workspace-context';
import { useEffect, useState } from 'react';
import type { Identity } from '../../application/access';
export default function AuthGate({
  children,
}: {
  children: (user: Identity | null) => React.ReactNode;
}) {
  const [session, setSession] = useState<{ user: Identity | null; preview: boolean } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [needsCode, setNeedsCode] = useState(false),
    [show, setShow] = useState(false),
    [username, setUsername] = useState('');
  const [scoped, setScoped] = useState(false);
  useEffect(() => {
    if (!session?.user && !session?.preview) return;
    const id = session?.user?.workspaceId || 'nexo';
    configureWorkspace(id, session?.user?.id || 'preview');
    const restore = bindWorkspaceFetch(id);
    setScoped(true);
    return restore;
  }, [session]);
  useEffect(() => {
    setUsername(localStorage.getItem('nexo-username') || '');
    fetch('/api/auth')
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setSession(b);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!session?.user) return;
    const refresh = async () => {
      try {
        const r = await fetch('/api/auth', { headers: { 'X-Session-Probe': '1' } });
        if (!r.ok) return;
        const next = await r.json();
        if (
          next.user &&
          (next.user.workspace?.version !== session.user?.workspace?.version ||
            JSON.stringify(next.user.permissions) !== JSON.stringify(session.user?.permissions))
        ) {
          setSession(next);
          window.dispatchEvent(new Event('crm:server-change'));
        }
      } catch {}
    };
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(() => void refresh(), 45000);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [session?.user]);
  if (session?.preview || (session?.user && !session.user.mustChange))
    return scoped ? children(session.user) : <p>Preparando empresa…</p>;
  const change = !!session?.user?.mustChange;
  return (
    <main className="authscreen">
      <section className="card authcard">
        <img src="/brand/nexo-logo.svg" alt="NEXO" width="160" />
        <h1>{change ? 'Elige tu contraseña' : 'Bienvenido a NEXO'}</h1>
        <p>
          {change
            ? 'Solo tendrás que hacerlo esta primera vez. Usa una frase fácil de recordar de al menos 12 caracteres.'
            : 'Introduce tu usuario y tu contraseña para entrar.'}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {session ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: change ? 'password' : 'login',
                    username: f.get('username'),
                    currentPassword: f.get('currentPassword'),
                    password: f.get('password'),
                    code: f.get('code'),
                  }),
                });
                const b = await r.json();
                if (!r.ok) throw Error(b.error);
                if (b.requiresCode) {
                  setNeedsCode(true);
                  return;
                }
                if (!change) {
                  if (f.get('remember')) localStorage.setItem('nexo-username', username);
                  else localStorage.removeItem('nexo-username');
                }
                sessionStorage.clear();
                location.reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {change ? (
              <label>
                Contraseña temporal
                <input
                  required
                  name="currentPassword"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={128}
                />
              </label>
            ) : (
              <label>
                Usuario
                <input
                  required
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  maxLength={50}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setNeedsCode(false);
                  }}
                  placeholder="Por ejemplo: comercial1"
                />
              </label>
            )}
            <label>
              {change ? 'Tu nueva contraseña' : 'Contraseña'}
              <input
                required
                name="password"
                type={show ? 'text' : 'password'}
                autoComplete={change ? 'new-password' : 'current-password'}
                minLength={change ? 12 : undefined}
                maxLength={128}
              />
            </label>
            <button type="button" className="link" onClick={() => setShow(!show)}>
              {show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            </button>
            {!change && (
              <label className="remember">
                <input type="checkbox" name="remember" defaultChecked />
                Recordar mi usuario en este equipo
              </label>
            )}
            {(needsCode || (change && !!session.user)) && (
              <>
                {needsCode ? (
                  <label>
                    Código de tu app
                    <input
                      required
                      name="code"
                      autoComplete="one-time-code"
                      maxLength={80}
                      placeholder="También puedes usar un código de recuperación"
                      autoFocus
                    />
                  </label>
                ) : (
                  <details>
                    <summary>Tengo activada la verificación en dos pasos</summary>
                    <label>
                      Código nuevo de tu app
                      <input name="code" autoComplete="one-time-code" maxLength={80} />
                    </label>
                  </details>
                )}
              </>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? 'Entrando…' : change ? 'Guardar y entrar' : 'Entrar'}
            </button>
            {!change && (
              <p className="muted">
                ¿No recuerdas la contraseña? Pide a tu administrador que la restablezca.
              </p>
            )}
          </form>
        ) : (
          <p>
            {error ? <button onClick={() => location.reload()}>Reintentar</button> : 'Conectando…'}
          </p>
        )}
      </section>
    </main>
  );
}
