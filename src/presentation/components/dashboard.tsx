'use client';
import { useBusinessSettings } from '../hooks/use-business-settings';
import { phaseFor } from '../../domain/business-settings';
import StageLabel from './stage-label';
import Module, { useViewAccess } from './module';
import { useMoney } from '../hooks/use-business-settings';
import { PermissionButton } from './permission-controls';
import { ArrowUpRight, CalendarCheck, Plus } from 'lucide-react';
import { completeTask } from '../../domain/actions';
import { type Data, type Deal, type Task, stages, subtotal } from '../../domain/model';
import { dueLabel } from './activity-list';
type Props = {
  data: Data;
  pendingCounts: Record<string, number>;
  onReviewWork: (id: string) => void;
  active: Deal[];
  deals: Deal[];
  tasks: Task[];
  profile: string;
  busy: boolean;
  company: (id: string) => string;
  setView: (view: string) => void;
  setActivityFilter: (filter: string) => void;
  setDealTab: (tab: string) => void;
  setSelected: (id: string) => void;
  open: (kind: string) => void;
  save: (data: Data) => Promise<boolean | undefined>;
};
export default function Dashboard({
  data,
  pendingCounts,
  onReviewWork,
  active,
  deals,
  tasks,
  profile,
  busy,
  company,
  setView,
  setActivityFilter,
  setDealTab,
  setSelected,
  open,
  save,
}: Props) {
  const money = useMoney();
  const canView = useViewAccess();
  const settings = useBusinessSettings();
  return (
    <>
      {Object.keys(pendingCounts).length > 0 && (
        <Module name="Obras">
          <section className="card">
            <h2>Partes por confirmar</h2>
            {Object.entries(pendingCounts)
              .filter(([, count]) => count > 0)
              .map(([id, count]) => (
                <p key={id}>
                  <button onClick={() => onReviewWork(id)}>
                    Revisar {count} {count === 1 ? 'parte' : 'partes'} ·{' '}
                    {data.works?.find((w) => w.id === id)?.name || 'Obra'}
                  </button>
                </p>
              ))}
          </section>
        </Module>
      )}
      <div className="metrics">
        {[
          [
            'Cartera abierta',
            money(
              active.reduce(
                (s, d) =>
                  s +
                  subtotal(
                    d.stage === 'Ganado'
                      ? data.orders.find((o) => o.dealId === d.id)?.lines || d.lines
                      : d.lines,
                  ),
                0,
              ),
            ),
            `${active.length} oportunidades en curso`,
          ],
          [
            'Pendientes de respuesta',
            String(deals.filter((d) => d.stage === stages[1]).length),
            'Presupuestos por seguir',
          ],
          [
            'Ventas ganadas',
            money(
              deals
                .filter((d) => d.stage === 'Ganado')
                .reduce(
                  (s, d) =>
                    s +
                    subtotal(
                      d.stage === 'Ganado'
                        ? data.orders.find((o) => o.dealId === d.id)?.lines || d.lines
                        : d.lines,
                    ),
                  0,
                ),
            ),
            'Importes sin impuestos',
          ],
          [
            'Próximas acciones',
            String(tasks.filter((t) => !t.done && !t.cancelled).length),
            'Seguimientos y recepción',
          ],
        ].map(
          ([label, value, desc], i) =>
            canView(i === 3 ? 'Actividades' : 'Tratos') && (
              <button
                key={label}
                className={'metric m' + i}
                onClick={() => setView(i === 3 ? 'Actividades' : 'Tratos')}
              >
                <span>
                  {label}
                  <ArrowUpRight size={17} />
                </span>
                <strong>{value}</strong>
                <small>{desc}</small>
              </button>
            ),
        )}
      </div>
      <div className="dashboardgrid">
        <Module name="Tratos">
          <section className="card">
            <div className="sectionhead">
              <div>
                <h2>El pulso de tus ventas</h2>
                <p>Distribución de oportunidades por fase</p>
              </div>
              <button className="link" onClick={() => setView('Tratos')}>
                Ver embudo ↗
              </button>
            </div>
            <div className="bars">
              {settings.phases.map((s, i) => {
                let count = deals.filter((d) => phaseFor(d, settings)?.id === s.id).length;
                return (
                  <div className="barcol" key={s.id}>
                    <div className="barplot">
                      <strong>{count}</strong>
                      <div
                        className={'bar bar' + i}
                        style={{
                          background: s.color,
                          height: Math.max(2, (count / Math.max(1, deals.length)) * 140) + 'px',
                        }}
                      />
                    </div>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="chartfoot">
              {deals.length} tratos en total <span>Vista actual · {profile}</span>
            </div>
          </section>
        </Module>
        <Module name="Actividades">
          <section className="card">
            <div className="sectionhead">
              <div>
                <h2>Tu siguiente paso</h2>
                <p>No dejes conversaciones a medias</p>
              </div>
              <CalendarCheck size={20} />
            </div>
            {tasks
              .filter((t) => !t.done && !t.cancelled)
              .sort((a, b) => a.due.localeCompare(b.due))
              .slice(0, 5)
              .map((t) => (
                <div className="taskrow" key={t.id}>
                  <PermissionButton
                    action="tasks"
                    className="check"
                    aria-label="Completar actividad"
                    disabled={busy}
                    onClick={() => {
                      save(completeTask(data, t.id, true));
                    }}
                  />
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {company(deals.find((d) => d.id === t.dealId)?.companyId || '')} · {t.kind}
                    </small>
                  </div>
                  <span className="due">{dueLabel(t.due)}</span>
                </div>
              ))}
            {!tasks.some((t) => !t.done && !t.cancelled) && (
              <div className="empty">Todo al día. Crea tu próxima actividad.</div>
            )}
            <PermissionButton action="tasks" className="wide" onClick={() => open('Actividad')}>
              <Plus size={15} /> Programar actividad
            </PermissionButton>
          </section>
        </Module>
      </div>
      <section className="card">
        <div className="sectionhead">
          <div>
            <h2>Oportunidades en movimiento</h2>
            <p>Los tratos que merecen tu atención</p>
          </div>
          <button className="link" onClick={() => setView('Tratos')}>
            Ver todos ↗
          </button>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Trato / Empresa</th>
                <th>Fase</th>
                <th>Responsable</th>
                <th>Base presupuestada</th>
              </tr>
            </thead>
            <tbody>
              {active.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button
                      className="recordlink"
                      onClick={() => {
                        setDealTab('Resumen');
                        setSelected(d.id);
                      }}
                    >
                      {d.title}
                    </button>
                    <small>{company(d.companyId)}</small>
                  </td>
                  <td>
                    <span className={'badge s' + stages.indexOf(d.stage)}>
                      <StageLabel deal={d} />
                    </span>
                  </td>
                  <td>{d.owner}</td>
                  <td>
                    {money(
                      subtotal(
                        d.stage === 'Ganado'
                          ? data.orders.find((o) => o.dealId === d.id)?.lines || d.lines
                          : d.lines,
                      ),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
