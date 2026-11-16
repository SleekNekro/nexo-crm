'use client';
import { photoUrl } from '../utils/workspace-context';
import { PermissionForm, PermissionButton } from './permission-controls';
import { workProgress } from '../../domain/progress';
import { useEffect, useState } from 'react';
import type { Data, Work, SupervisionEntry } from '../../domain/model';
import { money } from '../../domain/model';
import { canReview, workCosts } from '../../domain/labor';
import { saveWork } from '../../domain/actions';
import { workBudget } from '../../domain/work-control';
import { recordId } from '../utils/record-id';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
const date = (value?: string) =>
  value ? new Date(value + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin definir';
export function WorkControlSummary({
  data,
  work,
  onTab,
}: {
  data: Data;
  work: Work;
  onTab: (tab: string) => void;
}) {
  const cost = workCosts(data, work.id),
    budget = workBudget(data, work),
    progress = workProgress(data, work.id);
  const reports = [
    ...(data.siteReports || []).filter((r) => r.workId === work.id),
    ...(data.laborReports || []).filter((r) => r.workId === work.id && r.status !== 'Borrador'),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const photos = reports.flatMap((r) => r.photos).slice(0, 4);
  const pending = (data.laborReports || []).filter(
    (r) => r.workId === work.id && r.status === 'Pendiente',
  ).length;
  const missing = cost.missingHours + cost.supervisionMissingHours;
  const overdue =
    !!work.end && work.end < localDay() && work.status !== 'Finalizada' && !work.actualEnd;
  const overcost = work.plannedCost != null && cost.total > work.plannedCost;
  const categories: [string, number][] = [
    ['Operarios', cost.labor],
    ['Supervisión', cost.supervisionCost],
    ['Materiales', cost.materials],
    ['Dietas', cost.diets],
    ['Alojamientos', cost.lodging],
    ['Gasolina', cost.fuel],
    ['Otros', cost.other],
  ];
  return (
    <div className="work-dashboard">
      <section className="work-glance card">
        <div
          className="work-progress-ring"
          style={{
            background: `conic-gradient(#a91d2a ${(progress.percent || 0) * 3.6}deg, #eee8df 0deg)`,
          }}
        >
          <div>
            <strong>{progress.percent == null ? '—' : progress.percent.toFixed(0) + '%'}</strong>
            <span>avance confirmado</span>
          </div>
        </div>
        <div className="work-glance-copy">
          <span className={'work-status status-' + work.status.replace(' ', '-')}>
            {work.status}
          </span>
          <h2>{progress.percent == null ? 'Avance pendiente de planificar' : 'Así va la obra'}</h2>
          <p>
            {work.areaM2 == null ? 'Superficie sin definir' : work.areaM2 + ' m²'} ·{' '}
            {work.plannedDays == null
              ? 'Duración sin definir'
              : work.plannedDays + ' días previstos'}{' '}
            · {work.workerIds?.length || 0} personas asignadas
          </p>
          <button onClick={() => onTab('Avance y partidas')}>Ver avance por partidas →</button>
        </div>
      </section>
      <div className="work-alerts" aria-label="Atención pendiente">
        {pending > 0 && (
          <button className="work-alert warning" onClick={() => onTab('Horas y costes')}>
            <strong>{pending} partes por confirmar</strong>
            <span>{cost.pendingHours} h pendientes · Revisar →</span>
          </button>
        )}
        {missing > 0 && (
          <button className="work-alert warning" onClick={() => onTab('Horas y costes')}>
            <strong>{missing} h sin valorar</strong>
            <span>Falta la tarifa de operarios o supervisión</span>
          </button>
        )}
        {cost.pendingExpenses > 0 && (
          <button className="work-alert warning" onClick={() => onTab('Horas y costes')}>
            <strong>{money(cost.pendingExpenses)} por confirmar</strong>
            <span>Revisar gastos →</span>
          </button>
        )}
        {overdue && (
          <div className="work-alert danger">
            <strong>Fin previsto superado</strong>
            <span>Estaba previsto para el {date(work.end)}</span>
          </div>
        )}
        {overcost && (
          <div className="work-alert danger">
            <strong>{money(cost.total - work.plannedCost!)} sobre el coste previsto</strong>
            <span>Revisar la previsión de la obra</span>
          </div>
        )}
        {cost.legacyHours > 0 && (
          <div className="work-alert warning">
            <strong>{cost.legacyHours} h de partes antiguos sin valorar</strong>
            <span>No incluidas en el coste individual</span>
          </div>
        )}
      </div>
      <div className="work-kpis">
        <div className="card">
          <span>Presupuesto de venta</span>
          <strong>{budget == null ? 'Sin definir' : money(budget)}</strong>
          <small>Sin IVA{work.orderId ? ' · Pedido vinculado' : ''}</small>
        </div>
        <div className="card">
          <span>Coste registrado</span>
          <strong>{money(cost.total)}</strong>
          <small>
            Previsto: {work.plannedCost == null ? 'sin definir' : money(work.plannedCost)} · Sin IVA
          </small>
        </div>
        <div className="card">
          <span>Horas de operarios</span>
          <strong>{cost.confirmedHours} h</strong>
          <small>Confirmadas por el responsable</small>
        </div>
        <div className="card">
          <span>Horas de supervisión</span>
          <strong>{cost.supervisionHours} h</strong>
          <small>{money(cost.supervisionCost)} valorados</small>
        </div>
      </div>
      <div className="work-dashboard-grid">
        <section className="card">
          <h2>Fechas y planificación</h2>
          <div className="work-dates">
            <div>
              <span>Inicio</span>
              <strong>{date(work.actualStart || work.start)}</strong>
              <small>
                {work.actualStart ? 'Real' : 'Previsto'} · Previsión: {date(work.start)}
              </small>
            </div>
            <div>
              <span>Fin</span>
              <strong>{date(work.actualEnd || work.end)}</strong>
              <small>
                {work.actualEnd ? 'Real' : 'Previsto'} · Previsión: {date(work.end)}
              </small>
            </div>
          </div>
          <p>
            Duración prevista:{' '}
            <b>{work.plannedDays == null ? 'sin definir' : work.plannedDays + ' días'}</b>
          </p>
          <small className="muted">
            Actualizado:{' '}
            {work.updatedAt
              ? new Date(work.updatedAt).toLocaleString('es-ES')
              : 'sin actualización registrada'}
          </small>
        </section>
        <section className="card">
          <div className="sectionhead">
            <h2>En qué se está gastando</h2>
            <button onClick={() => onTab('Horas y costes')}>Ver costes →</button>
          </div>
          <div className="work-cost-bars">
            {categories.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <div className="work-cost-track">
                  <span
                    style={{ width: (cost.total > 0 ? (value / cost.total) * 100 : 0) + '%' }}
                  />
                </div>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>
          <small className="muted">
            Costes registrados y valorados. No incluye gastos futuros ni pendientes.
          </small>
        </section>
        <section className="card">
          <div className="sectionhead">
            <h2>Últimas novedades</h2>
            <button onClick={() => onTab('Horas y costes')}>Ver partes →</button>
          </div>
          {reports.length ? (
            reports.slice(0, 3).map((r) => (
              <article className="work-update" key={r.id}>
                <small>
                  {date(r.date)} ·{' '}
                  {'author' in r
                    ? r.author
                    : data.workers?.find((w) => w.id === r.workerId)?.name || 'Operario'}
                  {'status' in r ? ' · ' + r.status : ''}
                </small>
                <p>{r.summary}</p>
                {r.incidents && <p className="incident">Incidencia declarada: {r.incidents}</p>}
              </article>
            ))
          ) : (
            <p className="empty">Todavía no hay partes registrados.</p>
          )}
        </section>
        <section className="card">
          <div className="sectionhead">
            <h2>Últimas fotos</h2>
            <button onClick={() => onTab('Fotos')}>Abrir galería →</button>
          </div>
          {photos.length ? (
            <div className="work-photo-preview">
              {photos.map((photo, i) => (
                <button
                  key={photo.id + '-' + i}
                  onClick={() => onTab('Fotos')}
                  aria-label="Abrir galería de la obra"
                >
                  <img src={photoUrl(photo.src)} alt={photo.caption || photo.name} loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">Las fotos de los partes aparecerán aquí.</p>
          )}
        </section>
      </div>
      {work.notes && (
        <section className="card">
          <h2>Notas de la obra</h2>
          <p>{work.notes}</p>
        </section>
      )}
    </div>
  );
}
export default function Supervision({
  data,
  work,
  profile,
  busy,
  onSave,
  onDirty,
}: {
  data: Data;
  work: Work;
  profile: string;
  busy: boolean;
  onSave: (data: Data) => Promise<boolean | undefined>;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<SupervisionEntry | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const entries = work.supervision || [],
    reviewer = canReview(work, profile);
  const close = () => {
    if (busy) return;
    if (draft && !confirm('¿Cerrar el registro de supervisión sin guardar?')) return;
    setDraft(null);
    onDirty(false);
  };
  const open = (entry?: SupervisionEntry) => {
    setError('');
    setDraft(
      entry
        ? { ...entry, changeReason: '' }
        : {
            id: recordId(),
            date: localDay(),
            person: work.responsible,
            hours: 1,
            rate: null,
            notes: '',
          },
    );
    onDirty(true);
  };
  return (
    <section className="card">
      <div className="sectionhead">
        <h2>Supervisión del responsable</h2>
        {reviewer && (
          <PermissionButton action="works" disabled={busy} onClick={() => open()}>
            Añadir supervisión
          </PermissionButton>
        )}
      </div>
      <p>
        Registra visitas y seguimiento. No repitas aquí horas ya incluidas en un parte de operario.
        La tarifa se conserva en cada registro.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!entries.length && <p className="muted">Todavía no hay supervisión registrada.</p>}
      {[...entries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((entry) => (
          <div className="taskrow" key={entry.id}>
            <div>
              <strong>
                {date(entry.date)} · {entry.person} · {entry.hours} h
              </strong>
              <p>
                {entry.rate == null ? 'Sin tarifa' : money(entry.hours * entry.rate)}
                {entry.notes ? ' · ' + entry.notes : ''}
              </p>
            </div>
            {reviewer && (
              <PermissionButton action="works" disabled={busy} onClick={() => open(entry)}>
                Editar
              </PermissionButton>
            )}
          </div>
        ))}
      {draft && (
        <FormDialog title="Registro de supervisión" onClose={close}>
          <PermissionForm
            action="works"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                const supervision = entries.some((x) => x.id === draft.id)
                  ? entries.map((x) => (x.id === draft.id ? draft : x))
                  : [...entries, draft];
                if (await onSave(saveWork(data, { ...work, supervision }))) {
                  setDraft(null);
                  onDirty(false);
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Fecha
              <input
                required
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              Responsable que supervisa
              <input
                required
                maxLength={150}
                value={draft.person}
                onChange={(e) => setDraft({ ...draft, person: e.target.value })}
              />
            </label>
            <div className="formpair">
              <label>
                Horas
                <input
                  required
                  type="number"
                  min="0.01"
                  max="24"
                  step="0.01"
                  value={draft.hours}
                  onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) })}
                />
              </label>
              <label>
                Coste por hora (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Sin definir"
                  value={draft.rate ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      rate: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Trabajo de supervisión
              <textarea
                maxLength={2000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="button" disabled={busy} onClick={close}>
              Cancelar
            </button>
            <PermissionButton action="works" className="primary" disabled={busy}>
              Guardar supervisión
            </PermissionButton>
            {entries.some((x) => x.id === draft.id) && (
              <label>
                Motivo de la corrección o eliminación
                <input
                  required
                  minLength={5}
                  maxLength={1000}
                  value={draft.changeReason || ''}
                  onChange={(e) => setDraft({ ...draft, changeReason: e.target.value })}
                  placeholder="Explica por qué cambia el registro"
                />
              </label>
            )}
            {entries.some((x) => x.id === draft.id) && (
              <PermissionButton
                action="works"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if ((draft.changeReason || '').trim().length < 5) {
                    setError('Indica primero el motivo de la eliminación.');
                    return;
                  }
                  if (!confirm('¿Eliminar este registro de supervisión?')) return;
                  if (
                    await onSave(
                      saveWork(data, {
                        ...work,
                        changeReason: draft.changeReason,
                        supervision: entries.filter((x) => x.id !== draft.id),
                      }),
                    )
                  ) {
                    setDraft(null);
                    onDirty(false);
                  }
                }}
              >
                Eliminar registro
              </PermissionButton>
            )}
          </PermissionForm>
        </FormDialog>
      )}
    </section>
  );
}
