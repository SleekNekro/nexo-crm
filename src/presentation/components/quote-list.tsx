'use client';
import { useMoney } from '../hooks/use-business-settings';
import { nextCommercialStep } from '../../domain/commercial-workflow';
import type { Task } from '../../domain/model';
import { dueLabel } from './activity-list';

import { quoteState, displayedQuote } from '../../domain/commercial-followup';
import { Deal, stages, total } from '../../domain/model';
type Props = {
  tasks: Task[];
  onNext: (id: string) => void;
  filter: string;
  setFilter: (s: string) => void;
  deals: Deal[];
  company: (id: string) => string;
  onOpen: (id: string) => void;
  onPrint: (deal: Deal, revision: Deal['versions'][number]) => void;
};
export default function QuoteList({
  tasks,
  onNext,
  filter,
  setFilter,
  deals,
  company,
  onOpen,
  onPrint,
}: Props) {
  const money = useMoney();
  const shown = deals.filter(
    (d) =>
      filter === 'Todos' ||
      (filter === 'Pendientes'
        ? !['Ganado', 'Perdido'].includes(d.stage)
        : quoteState(d) === filter),
  );
  return (
    <section className="card">
      <div className="sectionhead">
        <div>
          <h2>Presupuestos</h2>
          <p>
            Estado de la revisión aceptada o última emitida · validez de 30 días desde su fecha. Los
            aceptados conservan su estado.
          </p>
        </div>
        <label>
          Mostrar
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['Pendientes', 'Todos', 'Borrador', 'Enviado', 'Aceptado', 'Caducado', 'Perdido'].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <p className="muted">
        {shown.length} presupuestos · {shown.reduce((n, d) => n + d.versions.length, 0)} revisiones
        guardadas
      </p>
      <div className="quotelist">
        {shown.map((d) => {
          const shownQuote = displayedQuote(d);
          const last = shownQuote.revision;
          return (
            <article className="quoteentry" key={d.id}>
              <div className="quoteentryhead">
                <div>
                  <button className="link" onClick={() => onOpen(d.id)}>
                    {d.title}
                  </button>
                  <small>
                    {company(d.companyId)} · {d.owner}
                  </small>
                  <span className={'badge s' + stages.indexOf(d.stage)}>{quoteState(d)}</span>
                </div>
                <div className="quoteamount">
                  <small>{shownQuote.label}</small>
                  <strong>{money(total(shownQuote.lines))}</strong>
                  <small>Con impuestos</small>
                </div>
              </div>
              <p className="nextaction">
                {(() => {
                  const step = nextCommercialStep(d, tasks);
                  return step.task ? dueLabel(step.task.due) + ' · ' + step.task.title : step.label;
                })()}
              </p>
              <div className="quoteactions">
                {!['Ganado', 'Perdido'].includes(d.stage) && (
                  <button className="primary" onClick={() => onNext(d.id)}>
                    {nextCommercialStep(d, tasks).label}
                  </button>
                )}
                <button onClick={() => onOpen(d.id)}>Abrir presupuesto</button>
                {last && (
                  <button onClick={() => onPrint(d, last)}>
                    {d.acceptedRevisionId ? 'PDF aceptado' : 'PDF de última revisión'}
                  </button>
                )}
              </div>
              {d.versions.length > 0 ? (
                <details>
                  <summary>
                    Ver {d.versions.length}{' '}
                    {d.versions.length === 1 ? 'revisión guardada' : 'revisiones guardadas'}
                  </summary>
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Versión</th>
                          <th>Fecha de creación</th>
                          <th>Total con impuestos</th>
                          <th>Documento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.versions
                          .map((v, i) => ({ v, i }))
                          .reverse()
                          .map(({ v, i }) => (
                            <tr key={v.id}>
                              <td>
                                {v.number || 'Histórica'} · Revisión {i + 1}
                                {i === d.versions.length - 1 ? ' · Última' : ''}
                                {d.acceptedRevisionId === v.id ? ' · Aceptada' : ''}
                              </td>
                              <td>{new Date(v.date).toLocaleDateString('es-ES')}</td>
                              <td>{money(total(v.lines))}</td>
                              <td>
                                <button onClick={() => onPrint(d, v)}>Imprimir / PDF</button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : (
                <p className="muted">
                  Sin revisiones guardadas. Abre el presupuesto para revisar las partidas y guardar
                  la primera.
                </p>
              )}
            </article>
          );
        })}
        {!shown.length && (
          <p className="empty">No hay presupuestos que coincidan con la búsqueda y el filtro.</p>
        )}
      </div>
    </section>
  );
}
