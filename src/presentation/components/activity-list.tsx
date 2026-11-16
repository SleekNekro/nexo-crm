'use client';
import ActivityPriorityBadge from './activity-priority-badge';
import {
  compareActivities,
  activityPriority,
  activityPriorities,
} from '../../domain/activity-priority';
import { activitySchedule } from '../../domain/commercial-followup';
import { PermissionButton } from './permission-controls';
import { useEffect, useState } from 'react';
import ActivityCalendar from './activity-calendar';
import { Deal, Task } from '../../domain/model';
export const localDay = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function dueLabel(due: string) {
  const today = localDay();
  return due === today
    ? 'Hoy'
    : (due < today ? 'Vencida · ' : '') + new Date(due + 'T12:00:00').toLocaleDateString('es-ES');
}
export default function ActivityList({
  tasks,
  deals,
  company,
  busy,
  onEdit,
  onCreate,
  onOpen,
  onComplete,
  filter,
  setFilter,
}: {
  tasks: Task[];
  deals: Deal[];
  company: (id: string) => string;
  busy: boolean;
  onEdit: (t: Task) => void;
  onCreate?: (date: string) => void;
  onOpen: (id: string) => void;
  onComplete: (id: string, done: boolean) => void;
  filter: string;
  setFilter: (f: string) => void;
}) {
  const today = localDay();
  const [priorityFilter, setPriorityFilter] = useState('Todas');
  const [mode, setMode] = useState(['Pendientes', 'Hoy'].includes(filter) ? 'Calendario' : 'Lista');
  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setMode('Lista');
  }, []);
  const [selectedDay, setSelectedDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const accepts = (t: Task, f: string) =>
    f === 'Completadas'
      ? t.done
      : f === 'Canceladas'
        ? !!t.cancelled
        : !t.done &&
          !t.cancelled &&
          (f === 'Pendientes' ||
            (f === 'Vencidas' ? t.due < today : f === 'Hoy' ? t.due === today : t.due > today));
  const shown = tasks
    .filter(
      (t) =>
        accepts(t, filter) &&
        (priorityFilter === 'Todas' || activityPriority(t) === priorityFilter),
    )
    .sort(compareActivities);
  const visible = mode === 'Calendario' ? shown.filter((t) => t.due === selectedDay) : shown;
  return (
    <section className="card">
      <label className="activity-priority-filter">
        Prioridad
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option>Todas</option>
          {activityPriorities.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <div className="filtertabs" aria-label="Vista de actividades">
        {['Calendario', 'Lista'].map((value) => (
          <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {value}
          </button>
        ))}
      </div>
      <div className="filtertabs" aria-label="Filtrar actividades">
        {['Pendientes', 'Vencidas', 'Hoy', 'Próximas', 'Completadas', 'Canceladas'].map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              if (f === 'Hoy') {
                setMonth(today.slice(0, 7));
                setSelectedDay(today);
              }
            }}
          >
            {f} <b>{tasks.filter((t) => accepts(t, f)).length}</b>
          </button>
        ))}
      </div>
      {mode === 'Calendario' && (
        <>
          <ActivityCalendar
            tasks={shown}
            month={month}
            selected={selectedDay}
            today={today}
            onSelect={setSelectedDay}
            onMonth={(value) => {
              setMonth(value);
              setSelectedDay(value + '-01');
            }}
          />
          <div className="calendar-day-heading">
            <h3>
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h3>
            {onCreate && (
              <PermissionButton
                action="tasks"
                className="primary"
                disabled={busy}
                onClick={() => onCreate(selectedDay)}
              >
                Añadir actividad este día
              </PermissionButton>
            )}
          </div>
        </>
      )}
      {visible.map((t) => {
        const d = deals.find((d) => d.id === t.dealId);
        return (
          <article className="taskrow agenda" key={t.id}>
            <div className="agendainfo">
              <strong>{t.title}</strong>
              {t.result && <p className="activity-result">Resultado: {t.result}</p>}
              <ActivityPriorityBadge task={t} />
              <small>
                {activitySchedule(t)} · {t.kind} · {t.owner} ·{' '}
                {t.cancelled || (t.done ? 'Completada' : dueLabel(t.due))}
              </small>
              <button className="recordlink" onClick={() => onOpen(t.dealId)}>
                {d?.title || 'Trato'} · {d ? company(d.companyId) : ''}
              </button>
            </div>
            <div className="agendaactions">
              <PermissionButton action="tasks" disabled={busy} onClick={() => onEdit(t)}>
                Editar / Reprogramar
              </PermissionButton>
              <PermissionButton
                action="tasks"
                disabled={busy}
                onClick={() => onComplete(t.id, !t.done && !t.cancelled)}
              >
                {t.done || t.cancelled ? 'Reabrir' : 'Completar'}
              </PermissionButton>
            </div>
          </article>
        );
      })}
      {!visible.length && (
        <p className="empty">
          {mode === 'Calendario'
            ? 'No hay actividades para este día con el filtro seleccionado.'
            : 'No hay actividades en esta vista.'}
        </p>
      )}
    </section>
  );
}
