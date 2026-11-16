'use client';
import { useEffect, useState } from 'react';
type Settings = {
  version: number;
  target: string;
  publicUrl: string;
  history: { at: string; actor: string; from: string; to: string }[];
};
type Check = { ticket: string; target: string; version: number };
export default function ServerSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [target, setTarget] = useState('');
  const [checked, setChecked] = useState<Check | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function call(body?: object) {
    const r = await fetch('/api/server-settings', {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    return b;
  }
  async function load() {
    try {
      const b = await call();
      setSettings(b);
      setTarget(b.target);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(value: string) {
    setTarget(value);
    setChecked(null);
    setConfirmed(false);
    setMessage('');
  }
  async function check() {
    setBusy(true);
    setChecked(null);
    setConfirmed(false);
    setMessage('');
    try {
      setChecked(await call({ action: 'check', target }));
      setMessage('Conexión verificada. Puedes confirmar el cambio.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!checked || !confirmed) return;
    setBusy(true);
    setMessage('');
    try {
      const b = await call({
        action: 'apply',
        ticket: checked.ticket,
        version: checked.version,
        confirm: true,
      });
      setSettings(b);
      setTarget(b.target);
      setChecked(null);
      setConfirmed(false);
      setMessage('Cambio aplicado a todos. Las siguientes conexiones utilizan el nuevo servidor.');
    } catch (e) {
      setChecked(null);
      setConfirmed(false);
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Servidor de la oficina</h2>
      <p>
        Solo el desarrollador puede cambiar este destino. Se aplica a todas las cuentas, empresas y
        aplicaciones que utilizan la entrada de oficina.
      </p>
      {settings && (
        <>
          <p>
            <strong>Dirección fija de las aplicaciones:</strong> {settings.publicUrl}
          </p>
          <p>
            <strong>Servidor actual:</strong> {settings.target}
          </p>
          <label style={{ display: 'grid', gap: 8 }}>
            Nuevo servidor
            <input
              type="url"
              value={target}
              disabled={busy}
              placeholder="http://192.168.0.40:3000/"
              onChange={(e) => edit(e.target.value)}
            />
          </label>
          <p>
            El destino debe tener los datos y fotos trasladados y la configuración de esta
            instalación. Cambiar el destino no copia datos. La entrada fija debe seguir encendida.
          </p>
          <button disabled={busy || !target.trim()} onClick={check}>
            {busy ? 'Procesando…' : 'Comprobar conexión'}
          </button>
          {checked && (
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy}
                />
                He verificado la copia de datos y fotos, y el equipo ha guardado su trabajo.
                Confirmo el cambio para todos.
              </label>
              <button className="primary" disabled={!confirmed || busy} onClick={apply}>
                Aplicar a todos
              </button>
            </div>
          )}
          <h3>Historial de cambios</h3>
          {!settings.history.length && <p>Todavía no se ha cambiado el servidor.</p>}
          {[...settings.history].reverse().map((h, i) => (
            <div
              key={h.at + i}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid var(--line)',
                overflowWrap: 'anywhere',
              }}
            >
              <p>
                {new Date(h.at).toLocaleString('es-ES')} · {h.actor}
              </p>
              <p>
                {h.from} → {h.to}
              </p>
              <button disabled={busy} onClick={() => edit(h.from)}>
                Preparar vuelta a este servidor
              </button>
            </div>
          ))}
        </>
      )}
      {message && (
        <p role="status" style={{ overflowWrap: 'anywhere' }}>
          {message}
        </p>
      )}
    </section>
  );
}
