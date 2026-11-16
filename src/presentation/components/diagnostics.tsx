'use client';
import { useEffect, useState } from 'react';
import ServerSettings from './server-settings';
type Report = {
  checkedAt: string;
  node: string;
  uptimeSeconds: number;
  database: { connected: boolean; latencyMs: number; stateVersion: number; valid: boolean };
  counts: Record<string, number>;
  photos: { referenced: number; missing: number };
  users: { role: string; active: boolean; count: number }[];
  activeSessions: number;
  salesEvents: number;
};
export default function Diagnostics() {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [view, setView] = useState('Estado');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/diagnostics');
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setReport(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div>
      <div className="heading">
        <div>
          <div className="eyebrow">DESARROLLADOR · ADMIN+</div>
          <h1>Diagnóstico de la aplicación</h1>
          <p>
            Diagnóstico y configuración de la plataforma. No se muestran contraseñas ni claves de
            acceso.
          </p>
        </div>
        <button disabled={busy} onClick={load}>
          {busy ? 'Comprobando…' : 'Actualizar diagnóstico'}
        </button>
      </div>
      <div className="toolbar">
        {['Estado', 'Datos y accesos', 'Servidor'].map((v) => (
          <button className={view === v ? 'primary' : ''} onClick={() => setView(v)} key={v}>
            {v}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {view === 'Servidor' && <ServerSettings />}
      {report && view !== 'Servidor' && (
        <section className="card">
          <p>Comprobado: {new Date(report.checkedAt).toLocaleString('es-ES')}</p>
          {view === 'Estado' ? (
            <>
              <div className="metrics">
                <div className="metric">
                  <span>PostgreSQL</span>
                  <strong>Conectado</strong>
                  <small>{report.database.latencyMs} ms</small>
                </div>
                <div className="metric">
                  <span>Integridad funcional</span>
                  <strong>{report.database.valid ? 'Correcta' : 'Revisar datos'}</strong>
                  <small>Versión {report.database.stateVersion}</small>
                </div>
                <div className="metric">
                  <span>Fotos inaccesibles</span>
                  <strong>{report.photos.missing}</strong>
                  <small>{report.photos.referenced} referencias distintas</small>
                </div>
              </div>
              <p>
                Node {report.node} · Proceso activo {Math.floor(report.uptimeSeconds / 60)} minutos.
              </p>
            </>
          ) : (
            <>
              <h2>Registros por colección</h2>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Colección</th>
                      <th>Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.counts).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                {report.salesEvents} movimientos comerciales · {report.activeSessions} sesiones
                activas.
              </p>
              <h2>Cuentas por acceso</h2>
              {report.users.map((r, i) => (
                <p key={i}>
                  {r.role} · {r.active ? 'Activas' : 'Desactivadas'}: {r.count}
                </p>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
