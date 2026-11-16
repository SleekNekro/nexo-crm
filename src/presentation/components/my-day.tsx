'use client';
import ActivityPriorityBadge from './activity-priority-badge';
import { PermissionButton } from './permission-controls';
import type { Data } from '../../domain/model';
import { myDay } from '../../domain/my-day';
import { localDay } from './activity-list';
type Props = {
  data: Data;
  profile: string;
  busy: boolean;
  onDeal: (id: string, tab: string) => void;
  onWork: (id: string) => void;
  onComplete: (id: string) => void;
  onAgenda: (filter: string) => void;
};
export default function MyDay({
  data,
  profile,
  busy,
  onDeal,
  onWork,
  onComplete,
  onAgenda,
}: Props) {
  const today = localDay(),
    { tasks, works, reports, quotes, late } = myDay(data, profile, today);
  return (
    <section className="myday">
      <div className="metrics">
        <button className="metric" onClick={() => onAgenda('Vencidas')}>
          <span>Actividades vencidas</span>
          <strong>{late}</strong>
          <small>Revisa las fechas pendientes</small>
        </button>
        <button className="metric" onClick={() => onAgenda('Hoy')}>
          <span>Para hoy</span>
          <strong>{tasks.length - late}</strong>
          <small>Tu agenda comercial</small>
        </button>
        <div className="metric">
          <span>Partes por revisar</span>
          <strong>{reports.length}</strong>
          <small>De las obras que puedes validar</small>
        </div>
        <div className="metric">
          <span>Presupuestos sin seguimiento</span>
          <strong>{quotes.length}</strong>
          <small>Tratos abiertos sin próxima actividad</small>
        </div>
      </div>
      <div className="dashboardgrid">
        <section className="card">
          <div className="sectionhead">
            <h2>Tu agenda de hoy</h2>
            <button onClick={() => onAgenda('Pendientes')}>Ver toda la agenda</button>
          </div>
          {!tasks.length && <p className="empty">No tienes actividades vencidas ni para hoy.</p>}
          {tasks.map((t) => (
            <div className="taskrow" key={t.id}>
              <div>
                <button className="recordlink" onClick={() => onDeal(t.dealId, 'Actividades')}>
                  {t.title}
                  <ActivityPriorityBadge task={t} />
                </button>
                <small>
                  {data.deals.find((d) => d.id === t.dealId)?.title} ·{' '}
                  {t.due < today ? 'Vencida · ' + t.due : 'Hoy'} · {t.owner}
                </small>
              </div>
              <PermissionButton action="tasks" disabled={busy} onClick={() => onComplete(t.id)}>
                Completar
              </PermissionButton>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Partes pendientes de confirmar</h2>
          {!reports.length && <p className="empty">No hay partes pendientes de tu revisión.</p>}
          {reports.map((r) => (
            <div className="taskrow" key={r.id}>
              <div>
                <strong>
                  {data.workers?.find((w) => w.id === r.workerId)?.name || 'Operario'}
                </strong>
                <small>
                  {works.find((w) => w.id === r.workId)?.name} · {r.date} · {r.hours} h
                </small>
              </div>
              <button onClick={() => onWork(r.workId)}>Revisar parte</button>
            </div>
          ))}
        </section>
      </div>
      <section className="card">
        <h2>Presupuestos que necesitan un siguiente paso</h2>
        <p>Estos tratos tienen presupuesto y ninguna actividad pendiente programada.</p>
        {!quotes.length && <p className="empty">No hay presupuestos abiertos sin seguimiento.</p>}
        {quotes.map((d) => (
          <div className="taskrow" key={d.id}>
            <div>
              <strong>{d.title}</strong>
              <small>
                {data.companies.find((c) => c.id === d.companyId)?.name} · {d.owner}
              </small>
            </div>
            <button onClick={() => onDeal(d.id, 'Actividades')}>Programar seguimiento</button>
          </div>
        ))}
      </section>
    </section>
  );
}
