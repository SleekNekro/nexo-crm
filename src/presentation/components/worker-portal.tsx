'use client';
import { photoUrl } from '../utils/workspace-context';
import { PermissionForm, PermissionButton } from './permission-controls';
import {
  readLaborDrafts,
  writeLaborDraft,
  deleteLaborDraft,
  type LocalLaborDraft,
} from '../utils/labor-drafts';
import { recordId } from '../utils/record-id';
import { useEffect, useRef, useState } from 'react';
import { saveLabor } from '../../domain/labor';
import type { Data, LaborReport, SitePhoto } from '../../domain/model';
import { workProgress } from '../../domain/progress';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
import { prepareSitePhoto } from './site-photos';
import { ReportMeasurements } from './work-progress';
type Props = {
  accountId?: string;
  data: Data;
  workerId: string;
  busy: boolean;
  error: string;
  onSave: (d: Data) => Promise<boolean | undefined>;
  onDirty: (v: boolean) => void;
};
export default function WorkerPortal({
  accountId,
  data,
  workerId,
  busy,
  error,
  onSave,
  onDirty,
}: Props) {
  const worker = data.workers?.find((w) => w.id === workerId),
    works = (data.works || []).filter((w) => w.workerIds?.includes(workerId)),
    reports = (data.laborReports || [])
      .filter((r) => r.workerId === workerId)
      .sort((a, b) => b.date.localeCompare(a.date));
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photoProgress, setPhotoProgress] = useState('');
  const [success, setSuccess] = useState('');
  const [draft, setDraft] = useState<LaborReport | null>(null),
    [dirty, setDirty] = useState(false),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState(''),
    [filter, setFilter] = useState('Todos'),
    [photo, setPhoto] = useState<SitePhoto | null>(null);
  const accountKey = accountId || 'preview:' + workerId;
  const [localDrafts, setLocalDrafts] = useState<LocalLaborDraft[]>([]);
  const [localStatus, setLocalStatus] = useState('');
  useEffect(() => {
    let alive = true;
    readLaborDrafts(accountKey)
      .then((saved) => {
        if (alive) setLocalDrafts(saved);
      })
      .catch(() => {
        if (alive)
          setLocalStatus(
            'No se puede guardar una copia en este dispositivo. Guarda el borrador en el servidor antes de salir.',
          );
      });
    return () => {
      alive = false;
    };
  }, [accountKey]);
  useEffect(() => {
    if (!draft || !dirty) return;
    let alive = true;
    setLocalStatus('Guardando copia en este dispositivo…');
    writeLaborDraft(accountKey, draft)
      .then(() => {
        if (alive) {
          setLocalStatus('Borrador protegido en este dispositivo');
          setLocalDrafts((old) => [
            ...old.filter((x) => x.report.id !== draft.id),
            {
              key: accountKey + ':' + draft.id,
              account: accountKey,
              report: draft,
              savedAt: new Date().toISOString(),
            },
          ]);
        }
      })
      .catch(() => {
        if (alive)
          setLocalStatus(
            'No se pudo guardar la copia local. No cierres esta pantalla; guarda el borrador cuando vuelva la conexión.',
          );
      });
    return () => {
      alive = false;
    };
  }, [draft, dirty, accountKey]);
  const recoverable = localDrafts.filter(
    (d) =>
      works.some((w) => w.id === d.report.workId) &&
      d.report.workerId === workerId &&
      !reports.some((r) => r.id === d.report.id && !['Borrador', 'Devuelto'].includes(r.status)),
  );
  async function discardLocal(id: string) {
    await deleteLaborDraft(accountKey, id);
    setLocalDrafts((old) => old.filter((x) => x.report.id !== id));
  }
  useEffect(() => {
    onDirty(dirty || uploading);
    return () => onDirty(false);
  }, [dirty, uploading, onDirty]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || uploading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, uploading]);
  function open(workId: string, r?: LaborReport) {
    r ??= reports.find(
      (report) =>
        report.workId === workId &&
        report.date === localDay() &&
        ['Borrador', 'Devuelto'].includes(report.status),
    );
    const local = recoverable
      .filter((x) => x.report.workId === workId && (!r || x.report.id === r.id))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
    if (local) r = structuredClone(local.report);
    setMessage(
      local ? 'Se ha recuperado el borrador de este dispositivo. Revísalo antes de enviarlo.' : '',
    );
    setSuccess('');
    setDirty(!!local);
    setDraft(
      r
        ? structuredClone(r)
        : {
            id: recordId(),
            workId,
            workerId,
            date: localDay(),
            hours: 8,
            summary: '',
            incidents: '',
            photos: [],
            status: 'Borrador',
            rate: null,
            history: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
    );
  }
  function close() {
    if (busy || uploading) return;
    if (
      dirty &&
      !confirm('¿Descartar los cambios sin guardar? Puedes guardar un borrador antes de salir.')
    )
      return;
    if (draft)
      void discardLocal(draft.id).catch(() => setMessage('No se pudo eliminar la copia local.'));
    setDraft(null);
    setDirty(false);
  }
  async function persist(submit: boolean) {
    if (!draft || busy || uploading || uploadLock.current) return;
    setMessage('');
    try {
      const next = saveLabor(data, draft, workerId, submit, new Date().toISOString());
      if (await onSave(next)) {
        await discardLocal(draft.id).catch(() => {});
        setSuccess(
          submit
            ? 'Parte enviado. Tus horas y fotos quedan pendientes de revisión.'
            : 'Borrador guardado. Puedes continuarlo desde tu obra.',
        );
        setDraft(null);
        setDirty(false);
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function upload(files: FileList | null) {
    if (!files || !files.length || !draft || busy || uploadLock.current) return;
    if (draft.photos.length + files.length > 8) {
      setMessage('Máximo 8 fotos por parte');
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    setMessage('');
    try {
      const photos: SitePhoto[] = [];
      const failures: string[] = [];
      for (const [index, file] of Array.from(files).entries()) {
        setPhotoProgress(`Preparando foto ${index + 1} de ${files.length}…`);
        try {
          photos.push({
            id: recordId(),
            name: file.name,
            caption: '',
            src: await prepareSitePhoto(file),
          });
        } catch (error) {
          failures.push(`${file.name}: ${(error as Error).message}`);
        }
      }
      if (photos.length) {
        setDraft((d) => d && { ...d, photos: [...d.photos, ...photos] });
        setDirty(true);
      }
      if (failures.length) setMessage(`${photos.length} fotos preparadas. ${failures.join(' ')}`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      uploadLock.current = false;
      setUploading(false);
      setPhotoProgress('');
    }
  }
  if (!worker)
    return (
      <section className="card empty">Este operario no existe. Selecciona otro perfil.</section>
    );
  return (
    <div className="workerportal">
      {recoverable.length > 0 && !draft && (
        <section className="card">
          <h2>Borradores de este dispositivo</h2>
          <p>Hay partes que puedes recuperar, incluso después de perder la conexión.</p>
          {recoverable.map((d) => (
            <PermissionButton
              action="labor"
              key={d.key}
              disabled={busy}
              onClick={() => open(d.report.workId, d.report)}
            >
              Continuar · {works.find((w) => w.id === d.report.workId)?.name} · {d.report.date}
            </PermissionButton>
          ))}
        </section>
      )}
      <div className="heading">
        <div>
          <div className="eyebrow">MI JORNADA</div>
          <h1>Hola, {worker.name}</h1>
          <p>Registra tus horas y fotos. El responsable revisará tu parte.</p>
        </div>
      </div>
      {success && (
        <p className="draftnotice" role="status">
          {success}
        </p>
      )}
      <h2>Mis obras</h2>
      <div className="workgrid">
        {works.map((w) => (
          <section className="card" key={w.id}>
            <span className="workstate">{w.status}</span>
            <h2>{w.name}</h2>
            <p>{w.address}</p>
            <small>Responsable: {w.responsible}</small>
            {reports.some(
              (r) =>
                r.workId === w.id &&
                r.date === localDay() &&
                ['Pendiente', 'Confirmado'].includes(r.status),
            ) && <p className="draftnotice">Ya has enviado un parte de hoy para esta obra.</p>}
            <PermissionButton
              action="labor"
              className="primary full"
              disabled={busy}
              onClick={() => open(w.id)}
            >
              {reports.some(
                (r) =>
                  r.workId === w.id &&
                  r.date === localDay() &&
                  ['Borrador', 'Devuelto'].includes(r.status),
              )
                ? 'Continuar parte de hoy'
                : 'Hacer parte de hoy'}
            </PermissionButton>
          </section>
        ))}
      </div>
      {!works.length && (
        <p className="empty">
          Aún no tienes obras asignadas. Tu responsable debe añadirte al equipo.
        </p>
      )}
      {reports.some(
        (r) => ['Borrador', 'Devuelto'].includes(r.status) && works.some((w) => w.id === r.workId),
      ) && (
        <>
          <section className="card">
            <h2>Mis pendientes</h2>
            <p>Continúa tus borradores y corrige los partes devueltos.</p>
            {reports
              .filter(
                (r) =>
                  ['Borrador', 'Devuelto'].includes(r.status) &&
                  works.some((w) => w.id === r.workId),
              )
              .map((r) => (
                <div className="taskrow" key={r.id}>
                  <div>
                    <strong>
                      {r.status === 'Devuelto' ? 'Corregir parte' : 'Borrador sin enviar'}
                    </strong>
                    <small>
                      {works.find((w) => w.id === r.workId)?.name} · {r.date}
                    </small>
                    {r.status === 'Devuelto' && <p>{r.history.at(-1)?.reason}</p>}
                  </div>
                  <PermissionButton
                    action="labor"
                    disabled={busy}
                    onClick={() => open(r.workId, r)}
                  >
                    {r.status === 'Devuelto' ? 'Corregir' : 'Continuar'}
                  </PermissionButton>
                </div>
              ))}
            {!reports.some(
              (r) =>
                ['Borrador', 'Devuelto'].includes(r.status) && works.some((w) => w.id === r.workId),
            ) && <p>No tienes borradores ni partes devueltos pendientes.</p>}
          </section>
        </>
      )}
      <h2 className="portalheading">Mis partes</h2>
      <label>
        Mostrar
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {['Todos', 'Borrador', 'Pendiente', 'Devuelto', 'Confirmado'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <div className="reportlist">
        {reports
          .filter((r) => filter === 'Todos' || r.status === filter)
          .map((r) => (
            <article className="card" key={r.id}>
              <div className="sectionhead">
                <div>
                  <span className={'reportstate state' + r.status}>
                    {r.status === 'Pendiente' ? 'Pendiente de validación' : r.status}
                  </span>
                  <h3>
                    {data.works?.find((w) => w.id === r.workId)?.name} ·{' '}
                    {new Date(r.date + 'T12:00:00').toLocaleDateString('es-ES')}
                  </h3>
                  <strong>{r.hours} horas</strong>
                </div>
                {['Borrador', 'Devuelto'].includes(r.status) &&
                  works.some((w) => w.id === r.workId) && (
                    <PermissionButton action="labor" onClick={() => open(r.workId, r)}>
                      Editar / Reenviar
                    </PermissionButton>
                  )}
              </div>
              <p className="prewrap">{r.summary}</p>
              <ReportMeasurements data={data} report={r} />
              {r.status === 'Devuelto' && (
                <p className="incident">Motivo: {r.history.at(-1)?.reason}</p>
              )}
              {r.status === 'Confirmado' && (
                <p className="muted">
                  Confirmado por {r.history.findLast((h) => h.action === 'Confirmar')?.actor}.
                  Solicita al responsable que lo reabra si necesitas corregirlo.
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
            </article>
          ))}
      </div>
      {!reports.length && <p className="empty">Tu primer parte aparecerá aquí.</p>}
      {draft && (
        <FormDialog title="Mi parte diario" onClose={close}>
          <div className="sectionhead">
            <h2>Mi parte diario</h2>
            <button type="button" disabled={busy || uploading} onClick={close}>
              Cerrar
            </button>
          </div>
          <p>
            {works.find((w) => w.id === draft.workId)?.name} · {worker.name}
          </p>
          <p className="muted">Solo tus horas. No incluyas las de otras personas.</p>
          {(message || error) && (
            <p className="error" role="alert">
              {message || error}
            </p>
          )}
          <PermissionForm
            action="labor"
            className="worker-report-form"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              void persist(true);
            }}
          >
            <div className="formpair">
              <p className="muted" role="status">
                {localStatus}
              </p>
              <label>
                Fecha
                <input
                  required
                  type="date"
                  max={localDay()}
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label>
                Mis horas
                <input
                  required
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={draft.hours}
                  onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="worker-hours-presets" aria-label="Horas habituales">
              {[4, 6, 8].map((hours) => (
                <PermissionButton
                  action="labor"
                  key={hours}
                  type="button"
                  disabled={busy || uploading}
                  aria-pressed={draft.hours === hours}
                  onClick={() => {
                    setDraft({ ...draft, hours });
                    setDirty(true);
                  }}
                >
                  {hours} horas
                </PermissionButton>
              ))}
            </div>
            <label>
              Trabajo realizado
              <textarea
                required
                rows={3}
                placeholder="Ej.: preparación del soporte y aplicación de primera capa"
                maxLength={6000}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </label>
            <h3>Fotos · {draft.photos.length}/8</h3>
            <div className="worker-photo-actions">
              <PermissionButton
                action="labor"
                type="button"
                disabled={busy || uploading || draft.photos.length >= 8}
                onClick={() => cameraRef.current?.click()}
              >
                Hacer foto
              </PermissionButton>
              <PermissionButton
                action="labor"
                type="button"
                disabled={busy || uploading || draft.photos.length >= 8}
                onClick={() => galleryRef.current?.click()}
              >
                Galería · varias fotos
              </PermissionButton>
              <input
                ref={cameraRef}
                className="visually-hidden"
                aria-label="Cámara del parte"
                type="file"
                capture="environment"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                disabled={busy || uploading}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={galleryRef}
                className="visually-hidden"
                aria-label="Galería del parte"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                multiple
                disabled={busy || uploading}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="muted">
              JPG, PNG, WebP y HEIC. Las fotos se optimizan en este dispositivo y se guardan con el
              parte.
            </p>
            {uploading && <p role="status">{photoProgress}</p>}
            <div className="photogrid draftphotos">
              {draft.photos.map((p) => (
                <div key={p.id}>
                  <img src={photoUrl(p.src)} alt={p.caption || p.name} />
                  <details>
                    <summary>Añadir comentario</summary>
                    <label>
                      Comentario
                      <input
                        value={p.caption}
                        maxLength={500}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            photos: draft.photos.map((x) =>
                              x.id === p.id ? { ...x, caption: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                  </details>
                  <PermissionButton
                    action="labor"
                    type="button"
                    onClick={() => {
                      setDraft({ ...draft, photos: draft.photos.filter((x) => x.id !== p.id) });
                      setDirty(true);
                    }}
                  >
                    Retirar
                  </PermissionButton>
                </div>
              ))}
            </div>
            <details className="worker-optional" open={!!draft.measurements?.length}>
              <summary>Registrar avance por partidas (opcional)</summary>
              <fieldset className="measurementeditor">
                <legend>Partidas trabajadas y avance</legend>
                <p className="muted">
                  Selecciona la zona. Registra el total acumulado de esa zona, no los m² de cada
                  persona. Si otra persona ya los registra, elige Solo horas.
                </p>
                {(draft.measurements || []).map((m, index) => {
                  const z = data.workZones?.find((z) => z.id === m.zoneId),
                    item = data.workItems?.find((i) => i.id === z?.itemId),
                    zone =
                      data.zoneProgress?.find((z) => z.id === m.zoneId) ||
                      workProgress(data, draft.workId)
                        .items.flatMap((i) => i.zones)
                        .find((z) => z.id === m.zoneId);
                  return (
                    <div className="crewrow" key={index}>
                      <label>
                        Partida y zona
                        <select
                          required
                          value={m.zoneId}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              measurements: draft.measurements!.map((x, k) =>
                                k === index ? { zoneId: e.target.value, quantity: null } : x,
                              ),
                            })
                          }
                        >
                          <option value="">Seleccionar zona</option>
                          {(data.workItems || [])
                            .filter((i) => i.workId === draft.workId && i.unit)
                            .flatMap((i) =>
                              (data.workZones || [])
                                .filter((z) => z.itemId === i.id)
                                .map((z) => (
                                  <option key={z.id} value={z.id}>
                                    {i.description} · {z.name}
                                  </option>
                                )),
                            )}
                        </select>
                      </label>
                      {zone && (
                        <p className="muted">
                          Confirmado: {zone.confirmed} {item?.unit} · Propuesto: {zone.proposed}{' '}
                          {item?.unit}
                        </p>
                      )}
                      <label>
                        Qué registro
                        <select
                          value={m.quantity === null ? 'hours' : 'quantity'}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              measurements: draft.measurements!.map((x, k) =>
                                k === index
                                  ? {
                                      ...x,
                                      quantity:
                                        e.target.value === 'hours' ? null : zone?.proposed || 0,
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          <option value="hours">
                            Solo horas · cantidad registrada por otro operario
                          </option>
                          <option value="quantity">Medición acumulada de esta zona</option>
                        </select>
                      </label>
                      {m.quantity !== null && (
                        <label>
                          Total ejecutado acumulado ({item?.unit || 'unidad'})
                          <input
                            required
                            type="number"
                            min="0"
                            max={item?.plannedQty}
                            step="0.01"
                            value={m.quantity}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                measurements: draft.measurements!.map((x, k) =>
                                  k === index ? { ...x, quantity: Number(e.target.value) } : x,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                      <PermissionButton
                        action="labor"
                        type="button"
                        onClick={() => {
                          setDraft({
                            ...draft,
                            measurements: draft.measurements!.filter((_, k) => k !== index),
                          });
                          setDirty(true);
                        }}
                      >
                        Quitar registro
                      </PermissionButton>
                    </div>
                  );
                })}
                <PermissionButton
                  action="labor"
                  type="button"
                  disabled={
                    !(data.workItems || []).some((i) => i.workId === draft.workId && i.unit)
                  }
                  onClick={() => {
                    setDraft({
                      ...draft,
                      measurements: [...(draft.measurements || []), { zoneId: '', quantity: null }],
                    });
                    setDirty(true);
                  }}
                >
                  Añadir partida trabajada
                </PermissionButton>
                {!(data.workItems || []).some((i) => i.workId === draft.workId && i.unit) && (
                  <p>
                    El responsable debe preparar las partidas y unidades. Puedes enviar tus horas y
                    fotos mientras tanto.
                  </p>
                )}
              </fieldset>
            </details>
            <details className="worker-optional" open={!!draft.incidents}>
              <summary>Incidencias u observaciones (opcional)</summary>
              <label>
                Incidencias / observaciones
                <textarea
                  maxLength={4000}
                  value={draft.incidents}
                  onChange={(e) => setDraft({ ...draft, incidents: e.target.value })}
                />
              </label>
            </details>
            <div className="worker-submit-actions">
              {(message || error) && (
                <p className="error full" role="alert">
                  {message || error}
                </p>
              )}
              <PermissionButton
                action="labor"
                type="button"
                disabled={busy || uploading}
                onClick={() => persist(false)}
              >
                Guardar borrador
              </PermissionButton>
              <button type="button" disabled={busy || uploading} onClick={close}>
                Cancelar
              </button>
              <PermissionButton
                action="labor"
                className="primary full"
                disabled={busy || uploading}
              >
                {busy ? 'Guardando…' : 'Enviar al responsable'}
              </PermissionButton>
            </div>
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
    </div>
  );
}
