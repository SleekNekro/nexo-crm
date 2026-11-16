'use client';
import type { Task } from '../../domain/model';
import { monthDays, shiftMonth } from '../utils/calendar';
export default function ActivityCalendar({
  tasks,
  month,
  selected,
  today,
  onMonth,
  onSelect,
}: {
  tasks: Task[];
  month: string;
  selected: string;
  today: string;
  onMonth: (month: string) => void;
  onSelect: (day: string) => void;
}) {
  const label = new Date(month + '-01T12:00:00').toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <div className="activity-calendar">
      <div className="calendar-toolbar">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => onMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <h2 aria-live="polite">{label}</h2>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => onMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => {
            onMonth(today.slice(0, 7));
            onSelect(today);
          }}
        >
          Hoy
        </button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="calendar-days" role="group" aria-label={label}>
        {monthDays(month).map((day) => {
          const events = tasks.filter((t) => t.due === day);
          return (
            <button
              type="button"
              key={day}
              className={
                (day.startsWith(month) ? '' : 'outside-month ') +
                (day === today ? 'calendar-today' : '')
              }
              aria-pressed={selected === day}
              aria-label={`${new Date(day + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}, ${events.length} actividades`}
              onClick={() => {
                if (!day.startsWith(month)) onMonth(day.slice(0, 7));
                onSelect(day);
              }}
            >
              <span>{Number(day.slice(-2))}</span>
              {!!events.length && (
                <small>
                  {events.length}
                  <span className="calendar-count-label"> actividades</span>
                </small>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
