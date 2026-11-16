'use client';
import { nextCommercialStep } from '../../domain/commercial-workflow';
import { useCanAction } from './permission-controls';
import { dealAlerts } from '../../domain/commercial-followup';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { type Data, type Deal, type Task, money, stages, subtotal } from '../../domain/model';
import { useKanbanDrag } from '../hooks/use-kanban-drag';
import { dueLabel } from './activity-list';
type Props = {
  deals: Deal[];
  tasks: Task[];
  orders: Data['orders'];
  busy: boolean;
  company: (id: string) => string;
  onNext: (id: string) => void;
  onOpen: (id: string) => void;
  onStage: (deal: Deal, stage: string) => void;
};
export default function DealKanban({
  deals,
  tasks,
  orders,
  busy,
  company,
  onOpen,
  onNext,
  onStage,
}: Props) {
  const [mobilePhase, setMobilePhase] = useState('Abiertos');
  const { drag, dropStage, suppressClick, cancelDrag, pointerDown, pointerMove, pointerUp } =
    useKanbanDrag(deals, busy || !useCanAction('deals'), onStage);
  return (
    <>
      <label className="mobile-phase-filter">
        Mostrar tratos
        <select value={mobilePhase} onChange={(e) => setMobilePhase(e.target.value)}>
          {['Abiertos', ...stages, 'Todos'].map((phase) => (
            <option key={phase}>{phase}</option>
          ))}
        </select>
      </label>
      <p className="draghelp">
        Arrastra un trato a otra fase. En móvil, filtra por fase y abre la ficha para cambiarla.
        Pulsa Esc para cancelar.
      </p>
      <div className="kanban">
        {stages.map((s, i) => (
          <section
            data-stage={s}
            data-mobile-hidden={
              mobilePhase !== 'Todos' &&
              (mobilePhase === 'Abiertos' ? ['Ganado', 'Perdido'].includes(s) : mobilePhase !== s)
            }
            className={'column ' + (drag && dropStage === s ? 'dropactive' : '')}
            key={s}
          >
            <div className={'columnhead phase' + i}>
              <h3>
                {s}
                <b>{deals.filter((d) => d.stage === s).length}</b>
              </h3>
              <small>
                {money(
                  deals
                    .filter((d) => d.stage === s)
                    .reduce(
                      (a, d) =>
                        a +
                        subtotal(
                          d.stage === 'Ganado'
                            ? orders.find((o) => o.dealId === d.id)?.lines || d.lines
                            : d.lines,
                        ),
                      0,
                    ),
                )}
              </small>
            </div>
            {deals
              .filter((d) => d.stage === s)
              .map((d) => (
                <article className="deal-card-group" key={d.id}>
                  <button
                    className={'dealcard ' + (drag?.id === d.id ? 'dragging' : '')}
                    key={d.id}
                    disabled={busy}
                    onPointerDown={(e) => pointerDown(e, d)}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={cancelDrag}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        suppressClick.current = true;
                        cancelDrag();
                        setTimeout(() => {
                          suppressClick.current = false;
                        }, 0);
                      }
                    }}
                    onClick={() => {
                      if (!suppressClick.current) onOpen(d.id);
                    }}
                  >
                    <span className="draggrip" aria-hidden="true">
                      ⋮⋮
                    </span>
                    <small>{company(d.companyId)}</small>
                    <strong>{d.title}</strong>
                    {dealAlerts(d, tasks).map((alert) => (
                      <span className="incident" key={alert}>
                        {alert}
                      </span>
                    ))}
                    <b>
                      {money(
                        subtotal(
                          d.stage === 'Ganado'
                            ? orders.find((o) => o.dealId === d.id)?.lines || d.lines
                            : d.lines,
                        ),
                      )}
                    </b>
                    <small>Sin impuestos</small>
                    <span className="nextaction">
                      {(() => {
                        const t = tasks
                          .filter((t) => t.dealId === d.id && !t.done && !t.cancelled)
                          .sort((a, b) => a.due.localeCompare(b.due))[0];
                        return t
                          ? dueLabel(t.due) + ' · ' + t.title
                          : ['Ganado', 'Perdido'].includes(d.stage)
                            ? 'Trato cerrado'
                            : 'Sin seguimiento programado';
                      })()}
                    </span>
                    <footer>
                      <span className="miniavatar">{d.owner[0]}</span>
                      {d.owner}
                      <ChevronRight size={15} />
                    </footer>
                  </button>
                  {!['Ganado', 'Perdido'].includes(d.stage) && (
                    <button
                      className="deal-next-button"
                      disabled={busy}
                      onClick={() => onNext(d.id)}
                    >
                      {nextCommercialStep(d, tasks).label} →
                    </button>
                  )}
                </article>
              ))}
          </section>
        ))}
      </div>
      {drag && (
        <div className="dragghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>
          {deals.find((d) => d.id === drag.id)?.title}
          <small>{dropStage ? 'Mover a ' + dropStage : 'Suelta sobre una fase'}</small>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {drag && dropStage ? 'Destino: ' + dropStage : ''}
      </div>
    </>
  );
}
