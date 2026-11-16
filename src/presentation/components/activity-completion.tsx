'use client';
import { useState } from 'react';
import type { Data, Task } from '../../domain/model';
import { daysFrom, finishCommercialActivity } from '../../domain/commercial-workflow';
import { recordId } from '../utils/record-id';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
import { PermissionButton } from './permission-controls';
export default function ActivityCompletion({
  task,
  data,
  busy,
  onSave,
  onClose,
  onNotice,
}: {
  task: Task;
  data: Data;
  busy: boolean;
  onSave: (data: Data) => Promise<boolean | undefined>;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const [result, setResult] = useState(''),
    [follow, setFollow] = useState(false),
    [title, setTitle] = useState('Seguimiento del cliente'),
    [due, setDue] = useState(daysFrom(localDay(), 3)),
    [error, setError] = useState('');
  const closed = ['Ganado', 'Perdido'].includes(
    data.deals.find((d) => d.id === task.dealId)?.stage || '',
  );
  const close = () => {
    if (
      !busy &&
      ((!result && !follow) ||
        confirm('¿Salir sin completar la actividad ni guardar el resultado?'))
    )
      onClose();
  };
  return (
    <FormDialog title="Completar actividad" onClose={close}>
      <h2>Completar actividad</h2>
      <p>{task.title}</p>
      {task.kind === 'Recepción' && (
        <p>Al completar esta actividad, el pedido quedará marcado como recibido.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError('');
          try {
            if (
              await onSave(
                finishCommercialActivity(
                  data,
                  task.id,
                  result,
                  follow ? { id: recordId(), title, due } : undefined,
                ),
              )
            ) {
              onNotice(
                follow
                  ? 'Actividad completada. Seguimiento para el ' +
                      new Date(due + 'T12:00:00').toLocaleDateString('es-ES') +
                      '.'
                  : 'Actividad completada.',
              );
              onClose();
            }
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Resultado (opcional)
          <textarea
            maxLength={4000}
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="Qué se ha hablado o acordado"
          />
        </label>
        {!closed && (
          <label>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Programar siguiente actividad
          </label>
        )}
        {follow && (
          <>
            <label>
              Próxima acción
              <input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="form-actions">
              {[
                [1, 'Mañana'],
                [3, 'En 3 días'],
                [7, 'En una semana'],
              ].map(([n, label]) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={due === daysFrom(localDay(), Number(n))}
                  onClick={() => setDue(daysFrom(localDay(), Number(n)))}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Fecha
              <input
                type="date"
                required
                min={localDay()}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </>
        )}
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <PermissionButton
            action={task.kind === 'Recepción' ? 'tasks,orders' : 'tasks'}
            className="primary"
            disabled={busy}
          >
            {busy ? 'Guardando…' : follow ? 'Completar y programar' : 'Completar actividad'}
          </PermissionButton>
        </div>
      </form>
    </FormDialog>
  );
}
