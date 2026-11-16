'use client';
import { PermissionForm, PermissionButton } from './permission-controls';
import { recordId } from '../utils/record-id';
import { useEffect, useState } from 'react';
import { canReview } from '../../domain/labor';
import type { Data, LaborReport, Work, WorkItem } from '../../domain/model';
import { addWorkZone, importWorkItems, saveWorkItem, workProgress } from '../../domain/progress';
import { FormDialog } from './dialog';
const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
export function ReportMeasurements({ data, report }: { data: Data; report: LaborReport }) {
  return (
    <div className="measurementlist">
      {(report.measurements || []).map((m) => {
        const z = data.workZones?.find((z) => z.id === m.zoneId),
          i = data.workItems?.find((i) => i.id === z?.itemId);
        return (
          <p key={m.zoneId}>
            <b>
              {i?.description} · {z?.name}
            </b>
            <br />
            {m.quantity === null
              ? 'Participación: solo horas; no añade cantidad.'
              : num(m.quantity) +
                ' ' +
                i?.unit +
                ' acumulados en esta zona (no se suman a otros partes de la misma zona).'}
          </p>
        );
      })}
    </div>
  );
}
type Props = {
  data: Data;
  work: Work;
  profile: string;
  busy: boolean;
  error: string;
  onSave: (d: Data) => Promise<boolean | undefined>;
  onDirty: (v: boolean) => void;
};
export default function WorkProgress({ data, work, profile, busy, error, onSave, onDirty }: Props) {
  const p = workProgress(data, work.id),
    editable = canReview(work, profile);
  const sources = [
    ...data.orders
      .filter((o) => data.deals.some((d) => d.id === o.dealId && d.companyId === work.companyId))
      .map((o) => ({
        id: 'order:' + o.id,
        label: 'Pedido · ' + data.deals.find((d) => d.id === o.dealId)?.title,
      })),
    ...data.deals
      .filter((d) => d.companyId === work.companyId)
      .flatMap((d) =>
        d.versions.map((v, i) => ({
          id: 'revision:' + v.id,
          label: d.title + ' · Revisión ' + (i + 1),
        })),
      ),
  ];
  const [source, setSource] = useState(
      work.orderId ? 'order:' + work.orderId : sources[0]?.id || '',
    ),
    [draft, setDraft] = useState<WorkItem | null>(null),
    [zoneItem, setZoneItem] = useState(''),
    [zoneName, setZoneName] = useState(''),
    [message, setMessage] = useState(''),
    [dirty, setDirty] = useState(false);
  const editing = !!draft || !!zoneItem;
  useEffect(() => {
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
  function close() {
    if (busy) return;
    if (dirty && !confirm('¿Descartar los cambios de planificación?')) return;
    setDraft(null);
    setZoneItem('');
    setDirty(false);
    setMessage('');
  }
  async function apply(next: () => Data) {
    setMessage('');
    try {
      if (await onSave(next())) {
        setDraft(null);
        setZoneItem('');
        setDirty(false);
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="progresspanel">
      <section className="card">
        <div className="sectionhead">
          <div>
            <h2>Avance automático por partidas</h2>
            <p>Solo se contabilizan mediciones de partes confirmados.</p>
          </div>
          <strong className="progressfigure">
            {p.percent === null ? 'Pendiente de planificación' : num(p.percent) + '%'}
          </strong>
        </div>
        <div className="progress">
          <span style={{ width: (p.percent || 0) + '%' }} />
        </div>
        <p>
          El porcentaje de cada partida se pondera por sus horas de esfuerzo previstas. Las horas
          reales se usan para el coste, no como medida de avance.
        </p>
        {p.items.length > 0 && p.percent === null && (
          <p className="draftnotice">
            Completa unidades y horas previstas de todas las partidas para calcular el avance
            global.
          </p>
        )}
        <p className="muted">
          En cada zona cuenta el mayor acumulado confirmado, una sola vez. Las zonas deben cubrir
          superficies distintas, sin solaparse. Si se reabre un parte, se recalcula con las
          mediciones que sigan confirmadas.
        </p>
        {p.unmeasured > 0 && (
          <p className="muted">
            {p.unmeasured} partes confirmados sin medición: aportan horas y coste, pero no cantidad
            ejecutada.
          </p>
        )}
      </section>
      {(message || error) && (
        <p className="error" role="alert">
          {message || error}
        </p>
      )}
      {editable && !p.items.length && (
        <section className="card">
          <h2>Preparar desde presupuesto o pedido</h2>
          <p>
            Se copian las descripciones, unidades y cantidades de la versión seleccionada. No se
            modifica el presupuesto.
          </p>
          <label>
            Origen
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Selecciona un origen</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <PermissionButton
            action="works"
            disabled={busy || !source}
            onClick={() =>
              apply(() => importWorkItems(data, work.id, source, profile, () => recordId()))
            }
          >
            Importar partidas
          </PermissionButton>
          {!sources.length && (
            <p className="muted">
              Guarda una revisión de presupuesto de este cliente para importarla, o añade partidas
              manualmente.
            </p>
          )}
        </section>
      )}
      {editable && (
        <PermissionButton
          action="works"
          onClick={() => {
            setDirty(false);
            setDraft({
              id: recordId(),
              workId: work.id,
              description: '',
              unit: 'm²',
              plannedQty: 1,
              plannedHours: null,
            });
          }}
        >
          Añadir partida
        </PermissionButton>
      )}
      {p.items.map((i) => (
        <section className="card" key={i.id}>
          <div className="sectionhead">
            <div>
              <h2>{i.description}</h2>
              <p>
                {num(i.executed)} / {num(i.plannedQty)} {i.unit || '· unidad por definir'}{' '}
                confirmados · {num(i.percent)}%
              </p>
            </div>
            {editable && (
              <PermissionButton
                action="works"
                onClick={() => {
                  setDirty(false);
                  setDraft({
                    id: i.id,
                    workId: i.workId,
                    description: i.description,
                    unit: i.unit,
                    plannedQty: i.plannedQty,
                    plannedHours: i.plannedHours,
                    source: i.source,
                  });
                }}
              >
                Editar planificación
              </PermissionButton>
            )}
          </div>
          <div className="progress">
            <span style={{ width: i.percent + '%' }} />
          </div>
          <p>
            {i.plannedHours === null
              ? 'Esfuerzo previsto pendiente'
              : num(i.plannedHours) + ' horas previstas de esfuerzo'}{' '}
            · {num(Math.max(0, i.proposed - i.executed))} {i.unit} adicionales propuestos por
            validar
          </p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Zona de trabajo</th>
                  <th>Acumulado confirmado</th>
                  <th>Acumulado propuesto</th>
                </tr>
              </thead>
              <tbody>
                {i.zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.name}</td>
                    <td>
                      {num(z.confirmed)} {i.unit}
                    </td>
                    <td>
                      {num(z.proposed)} {i.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editable && (
            <PermissionButton
              action="works"
              onClick={() => {
                setDirty(false);
                setZoneItem(i.id);
                setZoneName('');
              }}
            >
              Añadir zona independiente
            </PermissionButton>
          )}
          <details>
            <summary>Mediciones y partes de origen</summary>
            {i.zones.flatMap((z) =>
              z.readings.map((read) => (
                <p key={z.id + '-' + read.report.id}>
                  {z.name} · {read.report.date} ·{' '}
                  {data.workers?.find((w) => w.id === read.report.workerId)?.name} ·{' '}
                  {num(read.quantity)} {i.unit} · {read.report.status}
                </p>
              )),
            )}
          </details>
        </section>
      ))}
      {draft && (
        <FormDialog title="Planificación de partida" onClose={close}>
          <h2>Planificación de partida</h2>
          {message && <p className="error">{message}</p>}
          <PermissionForm
            action="works"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              void apply(() => saveWorkItem(data, draft, profile));
            }}
          >
            <label>
              Descripción
              <input
                required
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label>
              Unidad
              <select
                required
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              >
                <option value="">Seleccionar unidad</option>
                {['m²', 'm', 'ud', 'h', 'kg', 'l'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
                {draft.unit && !['m²', 'm', 'ud', 'h', 'kg', 'l'].includes(draft.unit) && (
                  <option>{draft.unit}</option>
                )}
              </select>
            </label>
            <label>
              Cantidad total prevista
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={draft.plannedQty}
                onChange={(e) => setDraft({ ...draft, plannedQty: Number(e.target.value) })}
              />
            </label>
            <label>
              Horas de esfuerzo previstas para toda la partida
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.plannedHours ?? ''}
                placeholder="Pendiente de estimar"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    plannedHours: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <p className="muted">
              Sirven para ponderar el avance global. No se deducen del precio ni de las horas ya
              consumidas.
            </p>
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <PermissionButton action="works" className="primary full" disabled={busy}>
              Guardar planificación
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
      {zoneItem && (
        <FormDialog title="Zona de trabajo" onClose={close}>
          <h2>Zona independiente</h2>
          {message && <p className="error">{message}</p>}
          <PermissionForm
            action="works"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              void apply(() => addWorkZone(data, zoneItem, zoneName, recordId(), profile));
            }}
          >
            <label>
              Nombre de zona
              <input
                required
                placeholder="Planta 1 · pasillo"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
              />
            </label>
            <p>
              Crea zonas que no se solapen. La primera sustituye la zona general si aún no tiene
              partes. Una zona general con partes no se puede subdividir.
            </p>
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <PermissionButton action="works" className="primary full" disabled={busy}>
              Guardar zona
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
    </div>
  );
}
