'use client';
import { photoUrl } from '../utils/workspace-context';
import { manualDate, plannedFinish, reconcileWorkDates } from '../../domain/work-dates';
import WorkHistory from './work-history';
import { useCanAction, PermissionForm, PermissionButton } from './permission-controls';
import { AccountSelect } from './assignee-select';
import WorkCardMetrics from './work-card-metrics';
import Supervision, { WorkControlSummary } from './work-control';
import { workBudget } from '../../domain/work-control';
import { recordId } from '../utils/record-id';
import { ArrowLeft, Camera, HardHat, MapPin, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { saveSiteReport, saveWork } from '../../domain/actions';
import type { Data, SiteCrew, SitePhoto, SiteReport, Work } from '../../domain/model';
import { money } from '../../domain/model';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
import LaborPanel from './labor-panel';
import { prepareSitePhoto } from './site-photos';
import WorkProgress from './work-progress';
type Props = {
  pendingCounts?: Record<string, number>;
  initialTab?: string;
  data: Data;
  profile: string;
  busy: boolean;
  error: string;
  onSave: (d: Data) => Promise<boolean | undefined>;
  selected: string;
  onSelect: (id: string) => void;
  onDirty: (v: boolean) => void;
};
const uid = () => recordId();
const date = (s: string) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha';
const hours = (r: SiteReport) => r.crew.reduce((n, c) => n + c.people * c.hours, 0);
export default function Works({
  pendingCounts = {},
  initialTab = 'Resumen',
  data,
  profile,
  busy,
  error,
  onSave,
  selected,
  onSelect,
  onDirty,
}: Props) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('Todas'),
    [tab, setTab] = useState('Resumen'),
    [workDraft, setWorkDraft] = useState<Work | null>(null),
    [reportDraft, setReportDraft] = useState<SiteReport | null>(null),
    [dirty, setDirty] = useState(false),
    [supervisionDirty, setSupervisionDirty] = useState(false),
    [uploading, setUploading] = useState(false),
    [localError, setLocalError] = useState(''),
    [photo, setPhoto] = useState<SitePhoto | null>(null);
  const canAssign = useCanAction('team,works');
  const allowed = (owner: string) => profile === 'Dirección' || owner === profile;
  const works = (data.works || []).filter((w) => allowed(w.owner) || w.reviewer === profile),
    work = works.find((w) => w.id === selected),
    reports = (data.siteReports || [])
      .filter((r) => r.workId === work?.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const companies = data.companies.filter(
    (c) => allowed(c.owner) || works.some((w) => w.companyId === c.id),
  );
  useEffect(() => {
    setTab(initialTab);
  }, [work?.id, initialTab]);
  const company = (id: string) => data.companies.find((c) => c.id === id)?.name || 'Sin cliente';
  const individualReports = (data.laborReports || []).filter(
    (r) => r.workId === work?.id && r.status !== 'Borrador',
  );
  const gallery = [...reports, ...individualReports].flatMap((r) =>
    r.photos.map((p) => ({ p, r })),
  );
  useEffect(() => {
    onDirty(dirty || uploading || supervisionDirty);
    return () => onDirty(false);
  }, [dirty, uploading, supervisionDirty, onDirty]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || uploading || supervisionDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, uploading, supervisionDirty]);
  function close() {
    if (busy || uploading) return;
    if (dirty && !confirm('Hay cambios sin guardar. ¿Descartarlos y cerrar?')) return;
    setDirty(false);
    setWorkDraft(null);
    setReportDraft(null);
    setLocalError('');
  }
  function openWork(w?: Work) {
    setLocalError('');
    setDirty(false);
    setWorkDraft(
      w
        ? structuredClone(w)
        : {
            id: uid(),
            companyId: companies[0]?.id || '',
            orderId: '',
            name: '',
            address: '',
            owner: profile === 'Dirección' ? '' : profile,
            responsible: profile === 'Dirección' ? '' : profile,
            reviewer: profile === 'Dirección' ? '' : profile,
            start: '',
            end: '',
            status: 'Planificada',
            progress: 0,
            notes: '',
          },
    );
  }
  function openReport(r?: SiteReport) {
    if (!work) return;
    setLocalError('');
    setDirty(false);
    setReportDraft(
      r
        ? structuredClone(r)
        : {
            id: uid(),
            workId: work.id,
            date: localDay(),
            author: profile === 'Dirección' ? work.responsible : profile,
            summary: '',
            materials: '',
            incidents: '',
            crew: [],
            photos: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
    );
  }
  function crewChange(id: string, fields: Partial<SiteCrew>) {
    setDirty(true);
    setReportDraft(
      (r) => r && { ...r, crew: r.crew.map((c) => (c.id === id ? { ...c, ...fields } : c)) },
    );
  }
  async function addPhotos(files: FileList | null) {
    if (!files || !reportDraft) return;
    const selection = Array.from(files);
    if (reportDraft.photos.length + selection.length > 8) {
      setLocalError('Puedes añadir hasta 8 fotos por parte.');
      return;
    }
    setUploading(true);
    setLocalError('');
    try {
      const photos: SitePhoto[] = [];
      for (const file of selection)
        photos.push({ id: uid(), name: file.name, caption: '', src: await prepareSitePhoto(file) });
      setReportDraft((r) => r && { ...r, photos: [...r.photos, ...photos] });
      setDirty(true);
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const shown = works.filter(
    (w) =>
      (status === 'Todas' || w.status === status) &&
      (w.name + ' ' + company(w.companyId) + ' ' + w.address + ' ' + w.responsible)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="works">
      <div className="heading">
        <div>
          <div className="eyebrow">OPERACIONES · CONTROL DE OBRA</div>
          <h1>{work ? work.name : 'Obras'}</h1>
          <p>
            {work
              ? 'Equipo, avance y lo que ocurre cada día.'
              : 'Personal propio y subcontratas, con un responsable por obra.'}
          </p>
        </div>
        {work ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (
                supervisionDirty &&
                !confirm('¿Descartar el registro de supervisión sin guardar?')
              )
                return;
              setSupervisionDirty(false);
              onSelect(work.id);
              setTab('Horas y costes');
            }}
          >
            <Plus size={16} />{' '}
            {pendingCounts[work.id] > 0
              ? `${pendingCounts[work.id]} partes por confirmar · Revisar`
              : 'Revisar horas y costes'}
          </button>
        ) : (
          <PermissionButton
            action="works"
            className="primary"
            disabled={!companies.length || busy}
            onClick={() => openWork()}
          >
            <Plus size={16} /> Nueva obra
          </PermissionButton>
        )}
      </div>
      {!work ? (
        <>
          <div className="metrics workmetrics">
            <div className="metric">
              <span>Obras en curso</span>
              <strong>{works.filter((w) => w.status === 'En curso').length}</strong>
            </div>
            <div className="metric">
              <span>Planificadas</span>
              <strong>{works.filter((w) => w.status === 'Planificada').length}</strong>
            </div>
            <div className="metric">
              <span>Partes de hoy</span>
              <strong>
                {
                  [
                    ...(data.siteReports || []),
                    ...(data.laborReports || []).filter((r) => r.status !== 'Borrador'),
                  ].filter((r) => r.date === localDay() && works.some((w) => w.id === r.workId))
                    .length
                }
              </strong>
            </div>
          </div>
          <div className="workfilters">
            <label>
              Buscar obra
              <input
                placeholder="Obra, cliente, ubicación o responsable…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Estado
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {['Todas', 'Planificada', 'En curso', 'Pausada', 'Finalizada'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="workgrid">
            {shown.map((w) => (
              <button
                className="card workcard"
                disabled={busy}
                key={w.id}
                onClick={() => {
                  onSelect(w.id);
                  setTab('Resumen');
                }}
              >
                <div className="workcard-badges">
                  <span className="workstate">{w.status}</span>
                  {pendingCounts[w.id] > 0 && (
                    <span className="work-pending-badge">
                      {pendingCounts[w.id]}{' '}
                      {pendingCounts[w.id] === 1 ? 'parte por confirmar' : 'partes por confirmar'}
                    </span>
                  )}
                </div>
                <h2>{w.name}</h2>
                <p>{company(w.companyId)}</p>
                <small>
                  <MapPin size={13} /> {w.address || 'Ubicación por completar'}
                </small>
                <p>
                  {w.areaM2 == null ? 'Superficie sin definir' : w.areaM2 + ' m²'} ·{' '}
                  {w.plannedDays == null
                    ? 'Duración sin definir'
                    : w.plannedDays + ' días previstos'}
                </p>
                <p>
                  Presupuesto:{' '}
                  <b>{workBudget(data, w) == null ? 'Sin definir' : money(workBudget(data, w)!)}</b>
                </p>
                <p>
                  Responsable: <b>{w.responsible}</b>
                </p>
                <WorkCardMetrics data={data} work={w} />
                <footer>
                  {date(w.start)} → {date(w.end)}
                  <span>Abrir ficha ↗</span>
                </footer>
              </button>
            ))}
          </div>
          {!shown.length && (
            <section className="card empty workempty">
              <HardHat size={36} />
              <h2>
                {works.length ? 'No hay obras con estos filtros' : 'Tu primera obra empieza aquí'}
              </h2>
              <p>
                {works.length
                  ? 'Prueba otro estado o búsqueda.'
                  : 'Crea la obra, asigna su responsable y registra el primer parte con fotos.'}
              </p>
              {!companies.length && (
                <p>Primero crea una empresa cliente en Comercial → Empresas.</p>
              )}
              {!!companies.length && !works.length && (
                <PermissionButton action="works" onClick={() => openWork()}>
                  Crear primera obra
                </PermissionButton>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          <button className="backlink" onClick={() => onSelect('')}>
            <ArrowLeft size={15} /> Todas las obras
          </button>
          <section className="card workoverview workoverview-compact">
            <div>
              <h2>{company(work.companyId)}</h2>
              <p>
                {work.address || 'Sin ubicación registrada'} · Responsable:{' '}
                <b>{work.responsible}</b> · Comercial: {work.owner}
              </p>
            </div>
            <div className="quoteactions">
              <PermissionButton
                action="works"
                className="primary"
                disabled={busy}
                onClick={async () => {
                  const next = structuredClone(data);
                  next.works!.find((w) => w.id === work.id)!.status =
                    work.status === 'Finalizada' ? 'En curso' : 'Finalizada';
                  await onSave(next);
                }}
              >
                {work.status === 'Finalizada' ? 'Reabrir obra' : 'Marcar como terminada'}
              </PermissionButton>
              <PermissionButton action="works" disabled={busy} onClick={() => openWork(work)}>
                Editar obra
              </PermissionButton>
            </div>
          </section>
          <div className="filtertabs worktabs">
            {[
              'Resumen',
              'Avance y partidas',
              'Horas y costes',
              'Supervisión',
              'Historial',
              'Partes anteriores',
              'Fotos',
            ].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => {
                  if (
                    supervisionDirty &&
                    !confirm('¿Descartar el registro de supervisión sin guardar?')
                  )
                    return;
                  setSupervisionDirty(false);
                  setTab(t);
                }}
              >
                {t}
                {t === 'Partes anteriores'
                  ? ' · ' + reports.length
                  : t === 'Fotos'
                    ? ' · ' + gallery.length
                    : ''}
              </button>
            ))}
          </div>
          {tab === 'Avance y partidas' && (
            <WorkProgress
              data={data}
              work={work}
              profile={profile}
              busy={busy}
              error={error}
              onSave={onSave}
              onDirty={onDirty}
            />
          )}
          {tab === 'Horas y costes' && (
            <LaborPanel
              onDirty={onDirty}
              data={data}
              work={work}
              profile={profile}
              busy={busy}
              error={error}
              onSave={onSave}
            />
          )}
          {tab === 'Resumen' && <WorkControlSummary data={data} work={work} onTab={setTab} />}
          {tab === 'Historial' && <WorkHistory key={work.id} workId={work.id} />}
          {tab === 'Supervisión' && (
            <Supervision
              key={work.id}
              data={data}
              work={work}
              profile={profile}
              busy={busy}
              onSave={onSave}
              onDirty={setSupervisionDirty}
            />
          )}
          {tab === 'Partes anteriores' && (
            <div className="reportlist">
              {reports.map((r) => (
                <article className="card reportcard" key={r.id}>
                  <div className="sectionhead">
                    <div>
                      <h2>{date(r.date)}</h2>
                      <p>
                        Registrado por {r.author} · {hours(r)} horas-persona
                      </p>
                    </div>
                    <PermissionButton action="works" onClick={() => openReport(r)}>
                      Editar parte
                    </PermissionButton>
                  </div>
                  <p className="draftnotice">
                    Parte general histórico: sus horas no se incorporan al coste individual.
                  </p>
                  <h3>Trabajos realizados</h3>
                  <p className="prewrap">{r.summary}</p>
                  {r.crew.length > 0 && (
                    <div className="crewchips">
                      {r.crew.map((c) => (
                        <span key={c.id}>
                          {c.kind} · {c.name} · {c.people} personas × {c.hours} h
                        </span>
                      ))}
                    </div>
                  )}
                  {r.materials && (
                    <>
                      <h3>Materiales</h3>
                      <p className="prewrap">{r.materials}</p>
                    </>
                  )}
                  {r.incidents && (
                    <div className="incident">
                      <h3>Incidencias / observaciones</h3>
                      <p className="prewrap">{r.incidents}</p>
                    </div>
                  )}
                  {r.photos.length > 0 && (
                    <div className="photogrid">
                      {r.photos.map((p) => (
                        <button className="phototile" key={p.id} onClick={() => setPhoto(p)}>
                          <img src={photoUrl(p.src)} alt={p.caption || p.name} />
                          <span>{p.caption || p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {!reports.length && (
                <section className="card empty">
                  <Camera size={30} />
                  <h2>Aún no hay partes</h2>
                  <p>Registra los trabajos del día, quién ha participado y las fotos de la obra.</p>
                  <p>
                    Los operarios envían sus propios partes desde su perfil. Asigna el equipo en
                    Horas y costes.
                  </p>
                </section>
              )}
            </div>
          )}
          {tab === 'Fotos' && (
            <section className="card">
              <h2>Registro fotográfico</h2>
              <p>Fotos asociadas a sus partes diarios.</p>
              <div className="photogrid">
                {gallery.map(({ p, r }) => (
                  <button className="phototile" key={p.id} onClick={() => setPhoto(p)}>
                    <img src={photoUrl(p.src)} alt={p.caption || p.name} />
                    <span>
                      {date(r.date)} · {p.caption || p.name}
                    </span>
                  </button>
                ))}
              </div>
              {!gallery.length && (
                <p className="empty">Añade fotos al crear o editar un parte diario.</p>
              )}
            </section>
          )}
        </>
      )}
      {workDraft && (
        <FormDialog title="Datos de la obra" onClose={close}>
          <h2>{works.some((w) => w.id === workDraft.id) ? 'Editar obra' : 'Nueva obra'}</h2>
          {(localError || error) && (
            <p role="alert" className="error">
              {localError || error}
            </p>
          )}
          <PermissionForm
            action="works"
            onChange={() => setDirty(true)}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const draftData = structuredClone(data);
                draftData.works = [
                  ...(draftData.works || []).filter((w) => w.id !== workDraft.id),
                  workDraft,
                ];
                const adjusted = reconcileWorkDates(data, draftData, localDay()).works!.find(
                  (w) => w.id === workDraft.id,
                )!;
                const n = saveWork(data, adjusted);
                if (await onSave(n)) {
                  onSelect(workDraft.id);
                  setWorkDraft(null);
                  setDirty(false);
                }
              } catch (e) {
                setLocalError((e as Error).message);
              }
            }}
          >
            <label>
              Nombre de la obra
              <input
                required
                maxLength={200}
                value={workDraft.name}
                onChange={(e) => setWorkDraft({ ...workDraft, name: e.target.value })}
              />
            </label>
            <label>
              Cliente
              <select
                required
                value={workDraft.companyId}
                onChange={(e) =>
                  setWorkDraft({ ...workDraft, companyId: e.target.value, orderId: '' })
                }
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pedido relacionado (opcional)
              <select
                value={workDraft.orderId}
                onChange={(e) => setWorkDraft({ ...workDraft, orderId: e.target.value })}
              >
                <option value="">Sin pedido vinculado</option>
                {data.orders
                  .filter((o) =>
                    data.deals.some(
                      (d) => d.id === o.dealId && d.companyId === workDraft.companyId,
                    ),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {data.deals.find((d) => d.id === o.dealId)?.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Dirección / ubicación
              <input
                maxLength={300}
                value={workDraft.address}
                onChange={(e) => setWorkDraft({ ...workDraft, address: e.target.value })}
              />
            </label>
            <label>
              Responsable que supervisa y confirma horas
              <AccountSelect
                disabled={profile !== 'Dirección' || !canAssign}
                value={workDraft.reviewer || ''}
                onChangeEvent={(e) =>
                  setWorkDraft({
                    ...workDraft,
                    reviewer: e.target.value,
                    responsible: e.target.value,
                  })
                }
              />
              <small>
                Esta cuenta tendrá acceso a la obra y podrá validar sus partes. En asignaciones
                antiguas sin responsable elegido confirma el comercial por defecto.
              </small>
            </label>
            <label>
              Comercial responsable
              <AccountSelect
                disabled={profile !== 'Dirección' || !canAssign}
                value={workDraft.owner}
                onChangeEvent={(e) => setWorkDraft({ ...workDraft, owner: e.target.value })}
              />
            </label>
            <div className="formpair">
              <label>
                Inicio previsto (opcional)
                <input
                  type="date"
                  value={workDraft.start}
                  onChange={(e) => setWorkDraft({ ...workDraft, start: e.target.value })}
                />
              </label>
              <label>
                Duración prevista (días naturales)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={workDraft.plannedDays ?? ''}
                  placeholder="Opcional"
                  onChange={(e) =>
                    setWorkDraft({
                      ...workDraft,
                      plannedDays: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="formpair">
              <label>
                Estado
                <select
                  value={workDraft.status}
                  onChange={(e) =>
                    setWorkDraft({ ...workDraft, status: e.target.value as Work['status'] })
                  }
                >
                  {['Planificada', 'En curso', 'Pausada', 'Finalizada'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Avance automático: configura las partidas en Avance y partidas.
              </p>
            </div>
            <div className="formpair">
              {([['areaM2', 'Superficie de la obra (m²)']] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workDraft[key] ?? ''}
                    placeholder="Sin definir"
                    onChange={(e) =>
                      setWorkDraft({
                        ...workDraft,
                        [key]: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="muted">
              La superficie no suma las capas ni las partidas. Fin previsto calculado:{' '}
              {date(plannedFinish(workDraft.start, workDraft.plannedDays))}. El día de inicio cuenta
              como primer día; se incluyen fines de semana.
            </p>
            <label>
              Importe presupuestado sin IVA (€)
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!!workDraft.orderId}
                value={
                  workDraft.orderId
                    ? (workBudget(data, workDraft) ?? '')
                    : (workDraft.budgetAmount ?? '')
                }
                placeholder="Sin definir"
                onChange={(e) =>
                  setWorkDraft({
                    ...workDraft,
                    budgetAmount: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
              <small>
                {workDraft.orderId
                  ? 'Importe del pedido vinculado, después de descuentos y sin IVA.'
                  : 'Precio de venta al cliente, distinto del coste previsto.'}
              </small>
            </label>
            <p className="muted">
              El inicio real se obtiene del primer parte confirmado. Al finalizar la obra se
              registra la fecha de hoy. Si se reabre, se elimina el fin real.
            </p>
            <details className="full">
              <summary>Ajustar fechas</summary>
              <p className="muted">
                Solo para corregir fechas. Desmarca la corrección para volver al cálculo automático.
                Las fechas introducidas anteriormente se conservan como correcciones.
              </p>
              {(['actualStart', 'actualEnd'] as const).map((key) => (
                <div key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={manualDate(workDraft, key)}
                      disabled={key === 'actualEnd' && workDraft.status !== 'Finalizada'}
                      onChange={(e) =>
                        setWorkDraft({ ...workDraft, [key + 'Manual']: e.target.checked })
                      }
                    />{' '}
                    Corregir {key === 'actualStart' ? 'inicio real' : 'fin real'}
                  </label>
                  {manualDate(workDraft, key) && (
                    <label>
                      {key === 'actualStart' ? 'Inicio real corregido' : 'Fin real corregido'}
                      <input
                        type="date"
                        value={workDraft[key] || ''}
                        disabled={key === 'actualEnd' && workDraft.status !== 'Finalizada'}
                        onChange={(e) =>
                          setWorkDraft({
                            ...workDraft,
                            [key]: e.target.value,
                            [key + 'Manual']: true,
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              ))}
            </details>
            <label>
              Coste previsto total (sin IVA)
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Pendiente de definir"
                value={workDraft.plannedCost ?? ''}
                onChange={(e) =>
                  setWorkDraft({
                    ...workDraft,
                    plannedCost: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
              <small>
                Incluye mano de obra, subcontratas, materiales y otros gastos. No es el precio de
                venta al cliente.
              </small>
            </label>
            <label>
              Notas generales
              <textarea
                maxLength={4000}
                value={workDraft.notes}
                onChange={(e) => setWorkDraft({ ...workDraft, notes: e.target.value })}
              />
            </label>
            <button type="button" onClick={close} disabled={busy}>
              Cancelar
            </button>
            <PermissionButton action="works" className="primary full" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar obra'}
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
      {reportDraft && (
        <FormDialog title="Parte diario" onClose={close}>
          <h2>
            {reports.some((r) => r.id === reportDraft.id)
              ? 'Editar parte diario'
              : 'Nuevo parte diario'}
          </h2>
          <p>{work?.name}</p>
          {(localError || error) && (
            <p className="error" role="alert">
              {localError || error}
            </p>
          )}
          <PermissionForm
            action="works"
            onChange={() => setDirty(true)}
            onSubmit={async (e) => {
              e.preventDefault();
              if (uploading) return;
              try {
                const n = saveSiteReport(data, {
                  ...reportDraft,
                  updatedAt: new Date().toISOString(),
                });
                if (await onSave(n)) {
                  setReportDraft(null);
                  setDirty(false);
                  setTab('Resumen');
                }
              } catch (e) {
                setLocalError((e as Error).message);
              }
            }}
          >
            <div className="formpair">
              <label>
                Fecha del parte
                <input
                  type="date"
                  required
                  max={localDay()}
                  value={reportDraft.date}
                  onChange={(e) => setReportDraft({ ...reportDraft, date: e.target.value })}
                />
              </label>
              <label>
                Registrado por
                <input
                  required
                  maxLength={150}
                  value={reportDraft.author}
                  onChange={(e) => setReportDraft({ ...reportDraft, author: e.target.value })}
                />
              </label>
            </div>
            <label>
              Trabajos realizados
              <textarea
                required
                rows={4}
                placeholder="Zona, tarea realizada y resultado del día…"
                maxLength={6000}
                value={reportDraft.summary}
                onChange={(e) => setReportDraft({ ...reportDraft, summary: e.target.value })}
              />
            </label>
            <h3>Personal y subcontratas</h3>
            <p className="muted">
              Una fila por equipo o persona. Horas por persona; el total multiplica personas ×
              horas.
            </p>
            {reportDraft.crew.map((c) => (
              <fieldset className="crewrow" key={c.id}>
                <legend>{c.kind}</legend>
                <label>
                  Tipo
                  <select
                    value={c.kind}
                    onChange={(e) => crewChange(c.id, { kind: e.target.value as SiteCrew['kind'] })}
                  >
                    <option>Propio</option>
                    <option>Subcontrata</option>
                  </select>
                </label>
                <label>
                  {c.kind === 'Propio' ? 'Nombre / equipo' : 'Empresa subcontratada'}
                  <input
                    required
                    maxLength={150}
                    value={c.name}
                    onChange={(e) => crewChange(c.id, { name: e.target.value })}
                  />
                </label>
                <div className="formpair">
                  <label>
                    Personas
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      required
                      value={c.people}
                      onChange={(e) => crewChange(c.id, { people: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Horas por persona
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      required
                      value={c.hours}
                      onChange={(e) => crewChange(c.id, { hours: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <PermissionButton
                  action="works"
                  type="button"
                  onClick={() => {
                    setDirty(true);
                    setReportDraft({
                      ...reportDraft,
                      crew: reportDraft.crew.filter((x) => x.id !== c.id),
                    });
                  }}
                >
                  Quitar equipo
                </PermissionButton>
              </fieldset>
            ))}
            <PermissionButton
              action="works"
              type="button"
              disabled={reportDraft.crew.length >= 50}
              onClick={() => {
                setDirty(true);
                setReportDraft({
                  ...reportDraft,
                  crew: [
                    ...reportDraft.crew,
                    { id: uid(), kind: 'Propio', name: '', people: 1, hours: 8 },
                  ],
                });
              }}
            >
              Añadir personal / subcontrata
            </PermissionButton>
            <p>
              <b>{hours(reportDraft)} horas-persona</b> en este parte
            </p>
            <label>
              Materiales utilizados
              <textarea
                maxLength={4000}
                placeholder="Material, cantidad y observaciones…"
                value={reportDraft.materials}
                onChange={(e) => setReportDraft({ ...reportDraft, materials: e.target.value })}
              />
            </label>
            <label>
              Incidencias / observaciones
              <textarea
                maxLength={4000}
                placeholder="Problemas, bloqueos o detalles a revisar…"
                value={reportDraft.incidents}
                onChange={(e) => setReportDraft({ ...reportDraft, incidents: e.target.value })}
              />
            </label>
            <h3>Fotos del día · {reportDraft.photos.length}/8</h3>
            <p className="muted">
              JPG, PNG, WebP o HEIC. Se optimizan en este dispositivo antes de guardarse. Las fotos
              se adjuntan al guardar el parte.
            </p>
            <label>
              Añadir fotos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                multiple
                disabled={uploading || busy}
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <label>
              Hacer foto con el móvil
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                capture="environment"
                disabled={uploading || busy}
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {uploading && <p role="status">Preparando fotos…</p>}
            <div className="photogrid draftphotos">
              {reportDraft.photos.map((p) => (
                <div key={p.id}>
                  <img src={photoUrl(p.src)} alt={p.caption || p.name} />
                  <label>
                    Comentario de la foto
                    <input
                      maxLength={500}
                      value={p.caption}
                      onChange={(e) =>
                        setReportDraft({
                          ...reportDraft,
                          photos: reportDraft.photos.map((x) =>
                            x.id === p.id ? { ...x, caption: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <PermissionButton
                    action="works"
                    type="button"
                    onClick={() => {
                      setDirty(true);
                      setReportDraft({
                        ...reportDraft,
                        photos: reportDraft.photos.filter((x) => x.id !== p.id),
                      });
                    }}
                  >
                    Retirar foto del parte
                  </PermissionButton>
                </div>
              ))}
            </div>
            <button type="button" disabled={busy || uploading} onClick={close}>
              Cancelar
            </button>
            <PermissionButton action="works" className="primary full" disabled={busy || uploading}>
              {busy ? 'Guardando…' : 'Guardar parte y fotos'}
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
      {photo && (
        <FormDialog title="Foto de obra" onClose={() => setPhoto(null)}>
          <button onClick={() => setPhoto(null)}>Cerrar foto</button>
          <img className="photofull" src={photoUrl(photo.src)} alt={photo.caption || photo.name} />
          <p>{photo.caption || photo.name}</p>
        </FormDialog>
      )}
    </div>
  );
}
function hoursTotal(reports: SiteReport[], kind?: SiteCrew['kind']) {
  return reports.reduce(
    (n, r) =>
      n +
      r.crew.filter((c) => !kind || c.kind === kind).reduce((s, c) => s + c.people * c.hours, 0),
    0,
  );
}
