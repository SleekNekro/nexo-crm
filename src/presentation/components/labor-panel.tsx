'use client';
import { photoUrl } from '../utils/workspace-context';
import {
  PermissionForm,
  PermissionButton,
  PermissionInput,
  useCanAction,
} from './permission-controls';
import { AccountSelect } from './assignee-select';
import { expenseKinds } from '../../domain/work-control';
import { recordId } from '../utils/record-id';
import { useEffect, useState } from 'react';
import { canReview, reviewLabor, saveExpense, saveWorker, workCosts } from '../../domain/labor';
import type { Data, SitePhoto, Work, Worker, WorkExpense } from '../../domain/model';
import { money } from '../../domain/model';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
import WorkCostComparison from './work-cost-comparison';
import { ReportMeasurements } from './work-progress';
type Props = {
  data: Data;
  work: Work;
  profile: string;
  busy: boolean;
  error: string;
  onDirty: (v: boolean) => void;
  onSave: (d: Data) => Promise<boolean | undefined>;
};
export default function LaborPanel({ data, work, profile, busy, error, onSave, onDirty }: Props) {
  const [tab, setTab] = useState('Validar horas'),
    [filter, setFilter] = useState('Pendiente'),
    [worker, setWorker] = useState<Worker | null>(null),
    [expense, setExpense] = useState<WorkExpense | null>(null),
    [review, setReview] = useState<{ id: string; action: 'Devolver' | 'Reabrir' } | null>(null),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [photo, setPhoto] = useState<SitePhoto | null>(null);
  const [dirty, setDirty] = useState(false);
  const editing = !!(worker || expense || review);
  useEffect(() => {
    if (!editing) setDirty(false);
    onDirty(editing && dirty);
    const warn = (e: BeforeUnloadEvent) => {
      if (editing && dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      onDirty(false);
      window.removeEventListener('beforeunload', warn);
    };
  }, [editing, dirty, onDirty]);
  function closeEditor() {
    if (busy) return;
    if (dirty && !confirm('¿Descartar los cambios sin guardar?')) return;
    setWorker(null);
    setExpense(null);
    setReview(null);
    setDirty(false);
  }
  const canManageTeam = useCanAction('team,works');
  const reports = (data.laborReports || []).filter((r) => r.workId === work.id),
    workers = data.workers || [],
    cost = workCosts(data, work.id),
    reviewer = canReview(work, profile);
  async function act(
    id: string,
    action: 'Confirmar' | 'Devolver' | 'Reabrir' | 'Valorar',
    why = '',
  ) {
    setMessage('');
    try {
      if (await onSave(reviewLabor(data, id, action, profile, why, new Date().toISOString()))) {
        setReview(null);
        setReason('');
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function assign(id: string) {
    const n = structuredClone(data),
      w = n.works!.find((w) => w.id === work.id)!;
    w.workerIds = w.workerIds?.includes(id)
      ? w.workerIds.filter((x) => x !== id)
      : [...(w.workerIds || []), id];
    await onSave(n);
  }
  return (
    <section className="laborpanel">
      <div className="filtertabs">
        {['Validar horas', 'Equipo y tarifas', 'Costes'].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
            {t === 'Validar horas'
              ? ' · ' + reports.filter((r) => r.status === 'Pendiente').length
              : ''}
          </button>
        ))}
      </div>
      {(message || error) && (
        <p className="error" role="alert">
          {message || error}
        </p>
      )}
      {tab === 'Validar horas' && (
        <>
          <div className="card">
            <h2>Validación individual de horas</h2>
            <p>
              Responsable validador: <b>{work.reviewer || work.owner}</b>. Dirección también puede
              revisar.
            </p>
            <label>
              Estado
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                {['Pendiente', 'Confirmado', 'Devuelto', 'Todos'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="reportlist">
            {reports
              .filter((r) => r.status !== 'Borrador' && (filter === 'Todos' || r.status === filter))
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => (
                <article className="card" key={r.id}>
                  <div className="sectionhead">
                    <div>
                      <span className={'reportstate state' + r.status}>{r.status}</span>
                      <h3>
                        {workers.find((w) => w.id === r.workerId)?.name} ·{' '}
                        {new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES')}
                      </h3>
                      <strong>{r.hours} horas</strong>
                    </div>
                    <div className="quoteactions">
                      {reviewer && r.status === 'Pendiente' && (
                        <>
                          <PermissionButton
                            action="labor"
                            className="primary"
                            disabled={busy}
                            onClick={() => act(r.id, 'Confirmar')}
                          >
                            {r.measurements?.some((m) => m.quantity !== null)
                              ? 'Confirmar horas y medición'
                              : 'Confirmar horas'}
                          </PermissionButton>
                          <PermissionButton
                            action="labor"
                            disabled={busy}
                            onClick={() => {
                              setReview({ id: r.id, action: 'Devolver' });
                              setReason('');
                            }}
                          >
                            Devolver
                          </PermissionButton>
                        </>
                      )}
                      {reviewer && r.status === 'Confirmado' && (
                        <PermissionButton
                          action="labor"
                          disabled={busy}
                          onClick={() => {
                            setReview({ id: r.id, action: 'Reabrir' });
                            setReason('');
                          }}
                        >
                          Reabrir para corregir
                        </PermissionButton>
                      )}
                    </div>
                  </div>
                  <p className="prewrap">{r.summary}</p>
                  <ReportMeasurements data={data} report={r} />
                  {r.incidents && <p className="incident">{r.incidents}</p>}
                  {r.status === 'Confirmado' && (
                    <p>
                      {r.rate === null
                        ? 'Horas confirmadas pendientes de valorar'
                        : r.hours + ' h × ' + money(r.rate) + ' = ' + money(r.hours * r.rate)}
                    </p>
                  )}
                  <div className="photogrid">
                    {r.photos.map((p) => (
                      <button className="phototile" key={p.id} onClick={() => setPhoto(p)}>
                        <img src={photoUrl(p.src)} alt={p.caption || p.name} />
                        <span>{p.caption || p.name}</span>
                      </button>
                    ))}
                  </div>
                  <details>
                    <summary>Historial del parte</summary>
                    {r.history.map((h, i) => (
                      <p key={i}>
                        {new Date(h.date).toLocaleString('es-ES')} · {h.actor} · {h.action}
                        {h.reason ? ' · ' + h.reason : ''}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
          </div>
          {!reports.some(
            (r) => r.status !== 'Borrador' && (filter === 'Todos' || r.status === filter),
          ) && <p className="empty">No hay partes en este estado.</p>}
        </>
      )}
      {tab === 'Equipo y tarifas' && (
        <section className="card">
          <div className="sectionhead">
            <div>
              <h2>Operarios asignados</h2>
              <p>El operario verá esta obra cuando esté asignado.</p>
            </div>
            {profile === 'Dirección' && (
              <PermissionButton
                action="team"
                onClick={() =>
                  setWorker({
                    id: recordId(),
                    name: '',
                    kind: 'Propio',
                    company: '',
                    rate: null,
                  })
                }
              >
                Crear operario
              </PermissionButton>
            )}
          </div>
          {profile === 'Dirección' && (
            <label>
              Responsable que confirma horas
              <AccountSelect
                value={work.reviewer || work.owner}
                onChangeEvent={async (e) => {
                  const n = structuredClone(data);
                  n.works!.find((w) => w.id === work.id)!.reviewer = e.target.value;
                  await onSave(n);
                }}
                disabled={busy || !canManageTeam}
              />
            </label>
          )}
          {workers
            .filter((w) => !w.archived)
            .map((w) => (
              <div className="taskrow" key={w.id}>
                <label className="assignment">
                  <input
                    type="checkbox"
                    checked={work.workerIds?.includes(w.id) || false}
                    disabled={busy || profile !== 'Dirección' || !canManageTeam}
                    onChange={() => assign(w.id)}
                  />
                  <span>
                    <b>{w.name}</b>
                    <small>
                      {w.kind}
                      {w.company ? ' · ' + w.company : ''}
                    </small>
                  </span>
                </label>
                <span>{w.rate === null ? 'Tarifa pendiente' : money(w.rate) + '/h'}</span>
                {profile === 'Dirección' && (
                  <PermissionButton action="team" onClick={() => setWorker(structuredClone(w))}>
                    Editar tarifa / datos
                  </PermissionButton>
                )}
              </div>
            ))}
          {!workers.length && (
            <p className="empty">
              Dirección debe crear los operarios y asignarlos a esta obra. No se generan personas ni
              tarifas ficticias automáticamente.
            </p>
          )}
          <p className="muted">
            Las tarifas solo se muestran en las vistas de gestión. Cambiarlas afecta a futuras
            confirmaciones; no modifica partes ya valorados.
          </p>
        </section>
      )}
      {tab === 'Costes' && (
        <>
          <WorkCostComparison data={data} work={work} />
          <section className="card">
            <h2>Coste registrado de la obra · sin IVA</h2>
            <p className="draftnotice">
              {cost.pendingHours ||
              cost.missingHours ||
              cost.supervisionMissingHours ||
              cost.pendingExpenses ||
              cost.legacyHours
                ? 'Coste incompleto: hay registros pendientes.'
                : 'Solo incluye los costes registrados. No estima el trabajo que falta.'}
            </p>
            <div className="metrics workmetrics">
              <div className="metric">
                <span>Coste confirmado valorado</span>
                <strong>{money(cost.total)}</strong>
              </div>
              <div className="metric">
                <span>Horas por validar</span>
                <strong>{cost.pendingHours} h</strong>
              </div>
              <div className="metric">
                <span>Horas confirmadas sin tarifa</span>
                <strong>{cost.missingHours} h</strong>
              </div>
            </div>
            <dl className="dealdata">
              <div>
                <dt>Mano de obra confirmada</dt>
                <dd>
                  {money(cost.labor)} · {cost.confirmedHours} h confirmadas
                </dd>
              </div>
              <div>
                <dt>Materiales confirmados</dt>
                <dd>{money(cost.materials)}</dd>
              </div>
              <div>
                <dt>Supervisión registrada</dt>
                <dd>
                  {cost.supervisionHours} h · {money(cost.supervisionCost)} ·{' '}
                  {cost.supervisionMissingHours} h sin tarifa
                </dd>
              </div>
              <div>
                <dt>Dietas confirmadas</dt>
                <dd>{money(cost.diets)}</dd>
              </div>
              <div>
                <dt>Alojamientos confirmados</dt>
                <dd>{money(cost.lodging)}</dd>
              </div>
              <div>
                <dt>Gasolina confirmada</dt>
                <dd>{money(cost.fuel)}</dd>
              </div>
              <div>
                <dt>Otros gastos confirmados</dt>
                <dd>{money(cost.other)}</dd>
              </div>
              <div>
                <dt>Gastos por confirmar</dt>
                <dd>{money(cost.pendingExpenses)}</dd>
              </div>
            </dl>
            {cost.legacyHours > 0 && (
              <p className="incident">
                {cost.legacyHours} horas-persona de partes generales antiguos no están valoradas ni
                se suman al coste individual. Revísalas antes de considerar completo el coste.
              </p>
            )}
            {reports
              .filter((r) => r.status === 'Confirmado' && r.rate === null)
              .map((r) => (
                <div className="taskrow" key={r.id}>
                  <span>
                    {workers.find((w) => w.id === r.workerId)?.name} · {r.hours} h · {r.date}
                  </span>
                  <PermissionButton
                    action="labor"
                    disabled={busy || !reviewer}
                    onClick={() => act(r.id, 'Valorar')}
                  >
                    Aplicar tarifa actual
                  </PermissionButton>
                </div>
              ))}
          </section>
          <section className="card">
            <div className="sectionhead">
              <h2>Materiales y otros gastos</h2>
              {reviewer && (
                <PermissionButton
                  action="expenses"
                  onClick={() =>
                    setExpense({
                      id: recordId(),
                      workId: work.id,
                      date: localDay(),
                      concept: '',
                      kind: 'Materiales',
                      amount: 0,
                      status: 'Pendiente',
                    })
                  }
                >
                  Añadir gasto
                </PermissionButton>
              )}
            </div>
            {(data.workExpenses || [])
              .filter((e) => e.workId === work.id)
              .map((e) => (
                <div className="taskrow" key={e.id}>
                  <div>
                    <strong>{e.concept}</strong>
                    <small>
                      {e.date} · {e.kind} · {e.status}
                      {e.quantity != null ? ' · ' + e.quantity + ' ' + (e.unit || '') : ''}
                    </small>
                  </div>
                  <b>{money(e.amount)}</b>
                  {reviewer && (
                    <PermissionButton
                      action="expenses"
                      onClick={() => setExpense({ ...structuredClone(e), changeReason: '' })}
                    >
                      Editar / Confirmar
                    </PermissionButton>
                  )}
                </div>
              ))}
            <p className="muted">
              Registra cada gasto una sola vez. Los materiales escritos en un parte son
              observaciones y no generan costes automáticamente.
            </p>
          </section>
        </>
      )}
      {worker && (
        <FormDialog title="Operario y tarifa" onClose={closeEditor}>
          <h2>Operario y coste por hora</h2>
          {message && <p className="error">{message}</p>}
          <PermissionForm
            action="team"
            onChange={() => setDirty(true)}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (await onSave(saveWorker(data, worker, profile))) setWorker(null);
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              Nombre
              <input
                required
                value={worker.name}
                onChange={(e) => setWorker({ ...worker, name: e.target.value })}
              />
            </label>
            <label>
              Tipo
              <select
                value={worker.kind}
                onChange={(e) => setWorker({ ...worker, kind: e.target.value as Worker['kind'] })}
              >
                <option>Propio</option>
                <option>Subcontrata</option>
              </select>
            </label>
            {worker.kind === 'Subcontrata' && (
              <label>
                Empresa subcontratada
                <input
                  value={worker.company}
                  onChange={(e) => setWorker({ ...worker, company: e.target.value })}
                />
              </label>
            )}
            <label>
              {worker.kind === 'Propio' ? 'Coste interno por hora (€)' : 'Tarifa por hora (€)'}
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Pendiente de definir"
                value={worker.rate ?? ''}
                onChange={(e) =>
                  setWorker({
                    ...worker,
                    rate: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <p className="muted">
              Dejar vacío significa pendiente de valorar, no cero. No es el precio de venta al
              cliente.
            </p>
            <button type="button" onClick={closeEditor}>
              Cancelar
            </button>
            <PermissionButton action="team" className="primary full" disabled={busy}>
              Guardar operario
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
      {review && (
        <FormDialog title={review.action + ' parte'} onClose={closeEditor}>
          <h2>{review.action} parte</h2>
          <PermissionForm
            action="labor"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              void act(review.id, review.action, reason);
            }}
          >
            <label>
              Motivo para el operario
              <textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <p>
              El operario podrá corregir y reenviar. Al reabrir, las horas dejan de contar como
              confirmadas.
            </p>
            <button type="button" onClick={closeEditor}>
              Cancelar
            </button>
            <PermissionButton action="labor" className="primary full" disabled={busy}>
              {review.action}
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
      {expense && (
        <FormDialog title="Gasto de obra" onClose={closeEditor}>
          <h2>Gasto de obra</h2>
          {message && <p className="error">{message}</p>}
          <PermissionForm
            action="expenses"
            onChange={() => setDirty(true)}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (await onSave(saveExpense(data, expense, profile))) setExpense(null);
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label>
              Concepto
              <input
                required
                value={expense.concept}
                onChange={(e) => setExpense({ ...expense, concept: e.target.value })}
              />
            </label>
            <label>
              Fecha
              <input
                type="date"
                required
                value={expense.date}
                onChange={(e) => setExpense({ ...expense, date: e.target.value })}
              />
            </label>
            <label>
              Tipo
              <select
                value={expense.kind}
                onChange={(e) =>
                  setExpense({ ...expense, kind: e.target.value as WorkExpense['kind'] })
                }
              >
                {expenseKinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            {expense.kind === 'Materiales' && (
              <div className="formpair">
                <label>
                  Cantidad (opcional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expense.quantity ?? ''}
                    onChange={(e) =>
                      setExpense({
                        ...expense,
                        quantity: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Unidad
                  <input
                    maxLength={30}
                    placeholder="kg, litros, sacos…"
                    value={expense.unit || ''}
                    onChange={(e) => setExpense({ ...expense, unit: e.target.value })}
                  />
                </label>
              </div>
            )}
            <label>
              Importe total sin IVA (€)
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: Number(e.target.value) })}
              />
            </label>
            {(data.workExpenses || []).some((e) => e.id === expense.id) && (
              <label>
                Motivo del cambio
                <input
                  required
                  minLength={5}
                  maxLength={1000}
                  value={expense.changeReason || ''}
                  onChange={(e) => setExpense({ ...expense, changeReason: e.target.value })}
                />
              </label>
            )}
            <label>
              Estado
              <select
                value={expense.status}
                onChange={(e) =>
                  setExpense({ ...expense, status: e.target.value as WorkExpense['status'] })
                }
              >
                <option>Pendiente</option>
                <option>Confirmado</option>
              </select>
            </label>
            <button type="button" onClick={closeEditor}>
              Cancelar
            </button>
            <PermissionButton action="expenses" className="primary full" disabled={busy}>
              Guardar gasto
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
      {photo && (
        <FormDialog title="Foto del parte" onClose={() => setPhoto(null)}>
          <button onClick={() => setPhoto(null)}>Cerrar</button>
          <img className="photofull" src={photoUrl(photo.src)} alt={photo.caption || photo.name} />
          <p>{photo.caption || photo.name}</p>
        </FormDialog>
      )}
    </section>
  );
}
