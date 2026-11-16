'use client';
import { useEffect, useState } from 'react';
import { money } from '../../domain/model';
import type { commercialAnalysis, SalesEvent } from '../../domain/sales-metrics';
import { localDay } from './activity-list';
type Result = {
  from: string;
  to: string;
  trackingSince: string;
  rows: ReturnType<typeof commercialAnalysis>;
  events: SalesEvent[];
  eventCount: number;
  previous: { from: string; to: string; rows: ReturnType<typeof commercialAnalysis> };
};
export default function CommercialAnalysis() {
  const today = localDay(),
    [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [range, setRange] = useState({ from: today.slice(0, 8) + '01', to: today }),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [metric, setMetric] = useState<'activated' | 'won' | 'wonValue' | 'winRate'>('activated'),
    [owner, setOwner] = useState('Todos');
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError('');
    fetch('/api/analytics?' + new URLSearchParams(range), { signal: abort.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setResult(b);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [range]);
  const rows = result?.rows.filter((r) => owner === 'Todos' || r.owner === owner) || [],
    sum = (key: 'newProspects' | 'activated' | 'closed' | 'wonValue') =>
      rows.reduce((s, r) => s + r[key], 0),
    max = Math.max(1, ...rows.map((r) => r[metric] || 0));
  const format = (n: number | null) =>
    n === null
      ? 'Sin cierres'
      : metric === 'wonValue'
        ? money(n)
        : metric === 'winRate'
          ? n + '%'
          : String(n);
  return (
    <div className="analysis">
      <div className="heading">
        <div>
          <div className="eyebrow">DIRECCIÓN · RESULTADOS COMERCIALES</div>
          <h1>De posibles clientes a ventas</h1>
          <p>Compara resultados, revisa oportunidades y detecta dónde hace falta apoyo.</p>
        </div>
      </div>
      <form
        className="analysisfilters card"
        onSubmit={(e) => {
          e.preventDefault();
          setRange({ from, to });
        }}
      >
        <label>
          Desde
          <input
            required
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            required
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Comercial
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option>Todos</option>
            {result?.rows.map((r) => (
              <option key={r.owner}>{r.owner}</option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Actualizando…' : 'Ver resultados'}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="muted">
            Resultados del {result.from} al {result.to}. Registro automático desde{' '}
            {new Date(result.trackingSince).toLocaleString('es-ES')}. Los datos anteriores se
            muestran solo en «Situación actual».
          </p>
          <div className="metrics">
            {[
              ['Nuevos posibles', sum('newProspects'), 'Empresas incorporadas'],
              ['Clientes activados', sum('activated'), 'Primer trato ganado'],
              ['Tratos cerrados', sum('closed'), 'Ganados y perdidos'],
              ['Importe ganado', money(sum('wonValue')), 'Sin IVA · no es facturación'],
            ].map(([title, value, hint]) => (
              <section className="metric" key={title}>
                <span>{title}</span>
                <strong>{value}</strong>
                <small>{hint}</small>
              </section>
            ))}
          </div>
          <section className="card">
            <div className="sectionhead">
              <div>
                <h2>Resultados por comercial</h2>
                <p>La comparación usa el mismo periodo para todo el equipo.</p>
              </div>
              <label>
                Comparar
                <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
                  <option value="activated">Clientes activados</option>
                  <option value="won">Tratos ganados</option>
                  <option value="wonValue">Importe ganado</option>
                  <option value="winRate">Porcentaje de cierres ganados</option>
                </select>
              </label>
            </div>
            <div className="comparisonbars">
              {rows.map((r) => (
                <div className="comparisonrow" key={r.owner}>
                  <strong>{r.owner}</strong>
                  <div className="comparisontrack">
                    <div style={{ width: ((r[metric] || 0) / max) * 100 + '%' }} />
                  </div>
                  <b>{format(r[metric])}</b>
                </div>
              ))}
            </div>
            {rows.every((r) => !r[metric]) && (
              <p className="empty">
                Todavía no hay resultados de este tipo en el periodo. Se registrarán al trabajar con
                los tratos.
              </p>
            )}
          </section>
          <section className="card">
            <h2>Cómo está avanzando cada comercial</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Comercial</th>
                    <th>Nuevos posibles</th>
                    <th>Activados</th>
                    <th>Tratos nuevos</th>
                    <th>Ganados</th>
                    <th>Perdidos</th>
                    <th>Cierre ganado</th>
                    <th>Seguimientos completados</th>
                    <th>Días hasta cierre</th>
                    <th>Ganados frente al periodo anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.owner}>
                      <td>
                        <strong>{r.owner}</strong>
                      </td>
                      <td>{r.newProspects}</td>
                      <td>{r.activated}</td>
                      <td className="num">{r.newDeals}</td>
                      <td>
                        <span className="badge s2">{r.won}</span>
                      </td>
                      <td>
                        <span className="badge s3">{r.lost}</span>
                      </td>
                      <td>{r.winRate === null ? 'Sin cierres' : r.winRate + '%'}</td>
                      <td>{r.completed}</td>
                      <td>
                        {r.averageCloseDays === null
                          ? 'Sin fechas suficientes'
                          : r.averageCloseDays + ' días (' + r.measuredClosures + ' cierres)'}
                      </td>
                      <td>
                        {(() => {
                          const previous =
                            result.previous.rows.find((p) => p.owner === r.owner)?.won || 0;
                          const delta = r.won - previous;
                          return `${previous} → ${r.won} (${delta > 0 ? '+' : ''}${delta})`;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Un cliente se activa una sola vez, con su primer trato ganado. Puede proceder de un
              periodo anterior. Cada trato cuenta una vez por periodo según su último cierre
              registrado; reabrirlo no borra el historial. Porcentaje de cierre ganado = ganados /
              (ganados + perdidos). No mide cobros ni facturación.
            </p>
          </section>
          <section className="card">
            <h2>Comparación con el periodo anterior</h2>
            <p>
              {result.previous.from} a {result.previous.to} · mismo número de días.
            </p>
            {new Date(result.previous.from) < new Date(result.trackingSince) && (
              <p className="incident">
                El periodo anterior incluye fechas sin seguimiento registrado; la comparación puede
                estar incompleta.
              </p>
            )}
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Anterior</th>
                    <th>Actual</th>
                    <th>Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {(['activated', 'won', 'wonValue', 'completed'] as const).map((key) => {
                    const previous = result.previous.rows
                        .filter((r) => owner === 'Todos' || r.owner === owner)
                        .reduce((n, r) => n + r[key], 0),
                      current = rows.reduce((n, r) => n + r[key], 0),
                      delta = current - previous;
                    return (
                      <tr key={key}>
                        <td>
                          {
                            {
                              activated: 'Clientes activados',
                              won: 'Tratos ganados',
                              wonValue: 'Importe ganado sin IVA',
                              completed: 'Actividades completadas',
                            }[key]
                          }
                        </td>
                        <td>{key === 'wonValue' ? money(previous) : previous}</td>
                        <td>{key === 'wonValue' ? money(current) : current}</td>
                        <td>
                          {delta > 0 ? '+' : ''}
                          {key === 'wonValue' ? money(delta) : delta}
                          {previous > 0
                            ? ` (${Math.round((delta / previous) * 100)}%)`
                            : ' · sin base porcentual'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Tiempo hasta cierre: desde la creación registrada hasta el último cierre del periodo,
              ganado o perdido. Se excluyen tratos antiguos sin fecha conocida.
            </p>
          </section>
          <section className="card">
            <h2>Situación actual de la cartera</h2>
            <p>
              Esta fotografía actual no cambia con el filtro de fechas. Incluye datos anteriores al
              registro de seguimiento.
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Comercial</th>
                    <th>Posibles</th>
                    <th>Activos</th>
                    <th>Tratos abiertos</th>
                    <th>Cartera abierta sin IVA</th>
                    <th>Ganados actuales</th>
                    <th>Seguimientos vencidos</th>
                    <th>Obras</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.owner}>
                      <td>
                        <strong>{r.owner}</strong>
                      </td>
                      <td>{r.possible}</td>
                      <td>{r.active}</td>
                      <td>{r.open}</td>
                      <td>{money(r.pipeline)}</td>
                      <td>{r.currentWon}</td>
                      <td>
                        <span className={r.overdue ? 'incident' : ''}>{r.overdue}</span>
                      </td>
                      <td>{r.works}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <h2>Movimientos que explican los resultados</h2>
            <p>
              Últimos 100 movimientos del periodo. El resultado se atribuye al comercial responsable
              en el momento del cambio.
            </p>
            <div className="analysisactivity">
              {result.events
                .filter((e) => owner === 'Todos' || e.owner === owner)
                .map((e, i) => (
                  <article key={i}>
                    <div>
                      <strong>{e.owner}</strong>
                      <small>{new Date(e.at!).toLocaleString('es-ES')}</small>
                    </div>
                    <div>
                      <span>
                        {e.kind === 'client_activated'
                          ? 'Posible → Activo'
                          : e.kind === 'company_created'
                            ? 'Nuevo posible cliente'
                            : e.kind === 'deal_created'
                              ? 'Nuevo trato'
                              : e.kind === 'activity_completed'
                                ? 'Actividad completada'
                                : (e.fromStage || 'Nuevo') + ' → ' + e.toStage}
                      </span>
                      <strong>{e.label}</strong>
                    </div>
                  </article>
                ))}
            </div>
            {result.eventCount === 0 && (
              <p className="empty">Aún no hay movimientos registrados en este periodo.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
