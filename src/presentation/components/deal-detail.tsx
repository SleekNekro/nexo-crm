'use client';
import Module, { useViewAccess } from './module';
import { CustomFieldsSummary } from './custom-fields';
import { useMoney } from '../hooks/use-business-settings';
import { useBusinessSettings } from '../hooks/use-business-settings';
import { phaseFor } from '../../domain/business-settings';
import QuoteRevisionActions from './quote-revision-actions';
import { matchingDraftRevision } from '../../domain/quote-workflow';
import type { WorkspaceBrand } from '../../domain/workspace';
import ActivityPriorityBadge from './activity-priority-badge';
import { compareActivities } from '../../domain/activity-priority';
import { scopedKey } from '../utils/workspace-context';
import { PermissionForm, PermissionButton, PermissionSelect } from './permission-controls';
import { recordId } from '../utils/record-id';
import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Data, Deal, Task, stages, subtotal, total } from '../../domain/model';
import { dueLabel } from './activity-list';
import { useDialog } from './dialog';
import ProductCatalogue from './product-catalogue';
type Props = {
  initialTab?: string;
  onTabChange: (tab: string) => void;
  deal: Deal;
  data: Data;
  busy: boolean;
  error: string;
  profile: string;
  onClose: () => void;
  onSave: (d: Data) => Promise<boolean | undefined>;
  onEdit: () => void;
  onStage: (s: string) => void;
  brand: WorkspaceBrand;
  onIssue: (openPdf?: boolean) => Promise<void>;
  onPrint: (v: Deal['versions'][number]) => void;
  onActivity: (t?: Task) => void;
  onComplete: (id: string, done: boolean) => void;
  onCompany: () => void;
};
const emptyLine = () => ({ description: '', unit: '', qty: 1, price: 0, discount: 0, tax: 21 });
export default function DealDetail({
  initialTab = 'Resumen',
  onTabChange,
  deal: d,
  data,
  busy,
  error,
  profile,
  onClose,
  onSave,
  onEdit,
  onStage,
  onIssue,
  brand,
  onPrint,
  onActivity,
  onComplete,
  onCompany,
}: Props) {
  const money = useMoney();
  const settings = useBusinessSettings();
  const canView = useViewAccess();
  const lineFormRef = useRef<HTMLFormElement>(null);
  const manualRef = useRef<HTMLDetailsElement>(null);
  const quoteActionsRef = useRef<HTMLElement>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(!d.lines.length);
  const [tab, setTab] = useState(initialTab),
    [lineIndex, setLineIndex] = useState<number | null>(null),
    [line, setLine] = useState(emptyLine),
    [lineDirty, setLineDirty] = useState(false),
    [note, setNote] = useState(''),
    [restored, setRestored] = useState(false),
    [removed, setRemoved] = useState<{ line: Deal['lines'][number]; index: number } | null>(null),
    [localError, setLocalError] = useState('');
  useEffect(() => setTab(initialTab), [initialTab]);
  const switchTab = (t: string) => {
    setTab(t);
    onTabChange(t);
  };
  const dirty = lineDirty || !!note;
  const close = () => {
    if (
      !busy &&
      (!dirty ||
        confirm(
          'Hay un borrador sin guardar. Se conservará en esta sesión para retomarlo. ¿Cerrar la ficha?',
        ))
    )
      onClose();
  };
  const ref = useDialog(close);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(scopedKey('deal-draft-' + d.id)) || 'null');
      if (saved) {
        setLine(saved.line);
        setLineDirty(saved.lineDirty);
        setNote(saved.note);
        setLineIndex(saved.lineIndex);
      }
    } catch {}
    setRestored(true);
  }, [d.id]);
  useEffect(() => {
    if (restored) {
      if (dirty)
        sessionStorage.setItem(
          scopedKey('deal-draft-' + d.id),
          JSON.stringify({ line, lineDirty, note, lineIndex }),
        );
      else sessionStorage.removeItem(scopedKey('deal-draft-' + d.id));
    }
  }, [restored, dirty, line, lineDirty, note, lineIndex, d.id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (
      (tab === 'Presupuesto' && !canView('Presupuestos')) ||
      (tab === 'Actividades' && !canView('Actividades'))
    )
      setTab('Resumen');
  }, [settings, tab]);
  const company = data.companies.find((c) => c.id === d.companyId),
    contact = data.contacts.find((c) => c.id === d.contactId);
  const activities = data.tasks
    .filter((t) => t.dealId === d.id)
    .sort(
      (a, b) =>
        Number(a.done || !!a.cancelled) - Number(b.done || !!b.cancelled) ||
        compareActivities(a, b),
    );
  const currentRevision =
    d.versions.find((v) => v.id === d.acceptedRevisionId) || d.versions.at(-1);
  const matchingRevision = matchingDraftRevision(data, d, brand);
  const pending = activities.filter((t) => !t.done && !t.cancelled).length,
    closed = ['Ganado', 'Perdido'].includes(d.stage);
  async function lineSave(e: React.FormEvent) {
    e.preventDefault();
    if (!line.description.trim()) return;
    const next = structuredClone(data),
      target = next.deals.find((x) => x.id === d.id)!;
    if (lineIndex === null) target.lines.push(line);
    else if (target.lines[lineIndex]) target.lines[lineIndex] = line;
    else {
      setLocalError('La partida ya no existe. Añádela como una partida nueva.');
      return;
    }
    if (await onSave(next)) {
      setLineIndex(null);
      setLine(emptyLine());
      setLineDirty(false);
    }
  }
  function editLine(i: number) {
    if (lineDirty && !confirm('¿Descartar los cambios de esta partida para editar otra?')) return;
    if (manualRef.current) manualRef.current.open = true;
    setLine({ ...emptyLine(), ...d.lines[i], unit: d.lines[i].unit || '' });
    setLineIndex(i);
    lineFormRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    lineFormRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    setLineDirty(false);
  }
  async function reorder(i: number, to: number) {
    const n = structuredClone(data),
      lines = n.deals.find((x) => x.id === d.id)!.lines;
    [lines[i], lines[to]] = [lines[to], lines[i]];
    await onSave(n);
  }
  return (
    <div className="overlay" onClick={close}>
      <section
        ref={ref}
        tabIndex={-1}
        className="drawer dealdrawer"
        role="dialog"
        aria-modal="true"
        aria-label="Ficha del trato"
        onClick={(e) => e.stopPropagation()}
      >
        <button aria-label="Cerrar ficha del trato" className="close" onClick={close}>
          <X />
        </button>
        <div className="eyebrow">FICHA DEL TRATO · {d.owner}</div>
        <h2>{d.title}</h2>
        <button
          className="recordlink"
          onClick={() => {
            if (!dirty || confirm('El borrador se conservará. ¿Abrir la empresa?')) onCompany();
          }}
        >
          {company?.name}
        </button>
        <div className="dealheadline">
          <span className={'badge s' + stages.indexOf(d.stage)}>
            {phaseFor(d, settings)?.label || d.stage}
          </span>
          <strong>
            {money(total(d.acceptedRevisionId ? currentRevision?.lines || d.lines : d.lines))}
            <small>
              {d.acceptedRevisionId ? 'Presupuesto aceptado' : 'Borrador actual'} · con impuestos
            </small>
          </strong>
        </div>
        <div className="dealtabs" aria-label="Secciones del trato">
          {['Resumen', 'Actividades', 'Presupuesto', 'Notas']
            .filter((t) =>
              t === 'Presupuesto'
                ? canView('Presupuestos')
                : t === 'Actividades'
                  ? canView('Actividades')
                  : true,
            )
            .map((t) => (
              <button
                aria-pressed={tab === t}
                key={t}
                onClick={() => switchTab(t)}
                className={tab === t ? 'chosen' : ''}
              >
                {t}
                {t === 'Actividades' && <b>{pending}</b>}
              </button>
            ))}
        </div>
        {dirty && (
          <p className="draftnotice" role="status">
            Borrador sin guardar · conservado en esta sesión
          </p>
        )}
        {(error || localError) && (
          <p className="error" role="alert">
            {error || localError}
          </p>
        )}
        {tab === 'Resumen' && (
          <div>
            <Module name="Presupuestos">
              <div className="deal-next-step">
                <strong>
                  {d.acceptedRevisionId
                    ? 'Presupuesto aceptado · pedido generado'
                    : currentRevision?.sentAt
                      ? 'Esperando respuesta del cliente'
                      : d.lines.length
                        ? 'Presupuesto listo para revisar'
                        : 'Prepara el presupuesto del trato'}
                </strong>
                <button className="primary" onClick={() => switchTab('Presupuesto')}>
                  {d.acceptedRevisionId
                    ? 'Ver presupuesto aceptado'
                    : currentRevision?.sentAt
                      ? 'Ver PDF / registrar aceptación'
                      : 'Preparar presupuesto'}
                </button>
                <p>
                  {currentRevision?.sentAt && !d.acceptedRevisionId
                    ? 'El seguimiento está en Actividades.'
                    : 'El presupuesto y sus acciones están juntos en la misma pestaña.'}
                </p>
              </div>
            </Module>
            <div className="sectionhead">
              <h3>Datos del trato</h3>
              <PermissionButton action="deals" disabled={busy} onClick={onEdit}>
                <Pencil size={14} /> Editar datos
              </PermissionButton>
            </div>
            <dl className="dealdata">
              <div>
                <dt>Empresa</dt>
                <dd>{company?.name || 'Sin empresa'}</dd>
              </div>
              <div>
                <dt>Contacto principal</dt>
                <dd>{contact?.name || 'Sin asignar'}</dd>
              </div>
              <div>
                <dt>Responsable</dt>
                <dd>{d.owner}</dd>
              </div>
              <div>
                <dt>Cierre previsto</dt>
                <dd>
                  {d.expectedClose
                    ? new Date(d.expectedClose + 'T12:00:00').toLocaleDateString('es-ES')
                    : 'Sin fecha'}
                </dd>
              </div>
            </dl>
            <p>{d.description || 'Sin descripción'}</p>
            <label>
              Fase comercial
              <PermissionSelect
                action="deals"
                disabled={busy}
                value={phaseFor(d, settings)?.id}
                onChange={(e) => onStage(e.target.value)}
              >
                {settings.phases.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </PermissionSelect>
            </label>
            {d.stage === 'Perdido' && <p>Motivo: {d.reason}</p>}
            <CustomFieldsSummary entity="deals" values={d.customFields} />
            <div className="dealsummary">
              <Module name="Actividades">
                <button onClick={() => switchTab('Actividades')}>
                  <strong>{pending}</strong> actividades pendientes
                </button>
              </Module>
              <Module name="Presupuestos">
                <button onClick={() => switchTab('Presupuesto')}>
                  <strong>{d.versions.length}</strong> revisiones guardadas
                </button>
              </Module>
            </div>
            <p className="muted">
              Cerrar el trato cancela los seguimientos pendientes; no los marca como realizados. Si
              hay revisiones, acepta la elegida desde Presupuesto para generar el pedido. La
              creación de obra es opcional.
            </p>
          </div>
        )}
        {tab === 'Actividades' && canView('Actividades') && (
          <div>
            <div className="sectionhead">
              <h3>Actividades del trato</h3>
              <PermissionButton action="tasks" disabled={busy} onClick={() => onActivity()}>
                <Plus size={14} /> Nueva actividad
              </PermissionButton>
            </div>
            {activities.map((t) => (
              <div className="taskrow agenda" key={t.id}>
                <div className="agendainfo">
                  <strong>{t.title}</strong>
                  {t.result && <p className="activity-result">Resultado: {t.result}</p>}
                  <ActivityPriorityBadge task={t} />
                  <small>
                    {t.kind} · {t.owner} ·{' '}
                    {t.cancelled || (t.done ? 'Completada' : dueLabel(t.due))}
                  </small>
                </div>
                <div className="agendaactions">
                  <PermissionButton action="tasks" disabled={busy} onClick={() => onActivity(t)}>
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
              </div>
            ))}
            {!activities.length && <p className="empty">Programa la siguiente acción.</p>}
          </div>
        )}
        {tab === 'Presupuesto' && canView('Presupuestos') && (
          <div>
            <section className="quote-workflow" ref={quoteActionsRef}>
              <h3>{d.acceptedRevisionId ? 'Presupuesto aceptado' : 'Presupuesto actual'}</h3>
              {!closed && (
                <PermissionButton
                  action="deals"
                  className="primary"
                  disabled={busy || dirty || lineIndex !== null || !d.lines.length}
                  onClick={() => void onIssue(true)}
                >
                  {matchingRevision
                    ? 'Abrir PDF de la revisión actual'
                    : 'Guardar revisión y abrir PDF'}
                </PermissionButton>
              )}
              {!d.lines.length && (
                <p>Añade productos o una partida para preparar el presupuesto.</p>
              )}
              {!!currentRevision && (
                <>
                  {!matchingRevision && !closed && (
                    <p className="draftnotice">
                      El borrador o los datos del documento han cambiado. Guarda una nueva revisión
                      para enviarlos. Las acciones siguientes corresponden a la revisión guardada
                      indicada.
                    </p>
                  )}
                  <QuoteRevisionActions
                    key={currentRevision.id}
                    showPdf={!matchingRevision || closed}
                    data={data}
                    deal={d}
                    revision={currentRevision}
                    busy={busy}
                    dirty={dirty}
                    onSave={onSave}
                    onPrint={() => onPrint(currentRevision)}
                    onError={setLocalError}
                  />
                </>
              )}
            </section>
            <h3>Partidas del borrador</h3>
            {closed && (
              <p className="muted">
                Reabre el trato para modificar el presupuesto. El pedido existente conserva sus
                importes.
              </p>
            )}
            {d.lines.map((l, i) => (
              <div className="budgetline" key={i}>
                <div>
                  <strong>
                    {i + 1}. {l.description}
                  </strong>
                  <small>
                    {l.qty} {l.unit || ''} × {money(l.price)} · Dto. {l.discount}% · IVA {l.tax}%
                  </small>
                  <b>{money(total([l]))} con IVA</b>
                </div>
                <div className="lineactions">
                  <PermissionButton
                    action="deals"
                    disabled={busy || closed}
                    onClick={() => editLine(i)}
                  >
                    Editar
                  </PermissionButton>
                  <PermissionButton
                    action="deals"
                    disabled={busy || closed || lineIndex !== null || lineDirty}
                    onClick={async () => {
                      const n = structuredClone(data);
                      n.deals
                        .find((x) => x.id === d.id)!
                        .lines.splice(i + 1, 0, structuredClone(l));
                      await onSave(n);
                    }}
                  >
                    Duplicar
                  </PermissionButton>
                  <PermissionButton
                    action="deals"
                    aria-label={'Subir partida ' + (i + 1)}
                    disabled={busy || closed || i === 0 || lineIndex !== null || lineDirty}
                    onClick={() => reorder(i, i - 1)}
                  >
                    ↑
                  </PermissionButton>
                  <PermissionButton
                    action="deals"
                    aria-label={'Bajar partida ' + (i + 1)}
                    disabled={
                      busy || closed || i === d.lines.length - 1 || lineIndex !== null || lineDirty
                    }
                    onClick={() => reorder(i, i + 1)}
                  >
                    ↓
                  </PermissionButton>
                  <PermissionButton
                    action="deals"
                    disabled={busy || closed || lineIndex !== null || lineDirty}
                    onClick={async () => {
                      const n = structuredClone(data);
                      n.deals.find((x) => x.id === d.id)!.lines.splice(i, 1);
                      if (await onSave(n)) setRemoved({ line: l, index: i });
                    }}
                  >
                    Quitar
                  </PermissionButton>
                </div>
              </div>
            ))}
            {removed && (
              <p className="draftnotice">
                Partida retirada.{' '}
                <PermissionButton
                  action="deals"
                  disabled={busy || closed}
                  onClick={async () => {
                    const n = structuredClone(data);
                    n.deals
                      .find((x) => x.id === d.id)!
                      .lines.splice(removed.index, 0, removed.line);
                    if (await onSave(n)) setRemoved(null);
                  }}
                >
                  Deshacer
                </PermissionButton>
              </p>
            )}
            {!closed && (
              <Module name="Catálogo">
                <details
                  className="catalogue-picker"
                  open={catalogueOpen}
                  onToggle={(e) => setCatalogueOpen(e.currentTarget.open)}
                >
                  <summary>Añadir productos del catálogo</summary>
                  <p>
                    Busca, selecciona y ajusta las cantidades. Puedes añadir varios productos
                    juntos.
                  </p>
                  <ProductCatalogue
                    disabled={busy || lineDirty || lineIndex !== null}
                    onAdd={async (items) => {
                      if (items.some(({ qty }) => !Number.isSafeInteger(qty) || qty < 1))
                        return false;
                      const next = structuredClone(data);
                      const target = next.deals.find((deal) => deal.id === d.id)!;
                      target.lines.push(
                        ...items.map(({ product, qty }) => ({
                          description: product.name,
                          unit: '',
                          qty,
                          price: product.price,
                          discount: 0,
                          tax: 21,
                        })),
                      );
                      const saved = !!(await onSave(next));
                      if (saved) {
                        setCatalogueOpen(false);
                        quoteActionsRef.current?.scrollIntoView({
                          block: 'start',
                          behavior: 'smooth',
                        });
                      }
                      return saved;
                    }}
                  />
                </details>
              </Module>
            )}
            {!closed && (
              <details
                className="manual-line-picker"
                ref={manualRef}
                open={lineDirty || lineIndex !== null || undefined}
              >
                <summary>Partida personalizada / editar partida</summary>
                <PermissionForm
                  action="deals"
                  ref={lineFormRef}
                  className="lineform"
                  onSubmit={lineSave}
                >
                  <h4>
                    {lineIndex === null
                      ? 'Partida personalizada'
                      : 'Editar partida ' + (lineIndex + 1)}
                  </h4>
                  <label>
                    Descripción
                    <input
                      required
                      maxLength={500}
                      value={line.description}
                      onChange={(e) => {
                        setLine({ ...line, description: e.target.value });
                        setLineDirty(true);
                      }}
                    />
                  </label>
                  <div className="lineinputs">
                    {(
                      [
                        ['qty', 'Cantidad'],
                        ['price', 'Precio €'],
                        ['discount', 'Dto. %'],
                        ['tax', 'IVA %'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          inputMode="decimal"
                          required
                          min={key === 'qty' ? 0.01 : 0}
                          max={key === 'discount' || key === 'tax' ? 100 : undefined}
                          step="0.01"
                          value={line[key]}
                          onChange={(e) => {
                            setLine({ ...line, [key]: Number(e.target.value) });
                            setLineDirty(true);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <PermissionButton action="deals" disabled={busy}>
                    {lineIndex === null ? 'Añadir partida' : 'Guardar partida'}
                  </PermissionButton>
                  {(lineIndex !== null || lineDirty) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!lineDirty || confirm('¿Descartar los cambios de esta partida?')) {
                          setLineIndex(null);
                          setLine(emptyLine());
                          setLineDirty(false);
                        }
                      }}
                    >
                      Cancelar edición
                    </button>
                  )}
                </PermissionForm>
              </details>
            )}
            <div className="budgettotals">
              <span>
                Base <b>{money(subtotal(d.lines))}</b>
              </span>
              <span>
                Impuestos <b>{money(total(d.lines) - subtotal(d.lines))}</b>
              </span>
              <strong>
                Total <span>{money(total(d.lines))}</span>
              </strong>
            </div>
            {!closed && (
              <PermissionButton
                action="deals"
                disabled={
                  busy || dirty || lineIndex !== null || !d.lines.length || !!matchingRevision
                }
                onClick={() => void onIssue(false)}
              >
                Guardar revisión sin abrir PDF
              </PermissionButton>
            )}
            <details className="quote-history">
              <summary>
                Revisiones anteriores (
                {d.versions.filter((v) => v.id !== currentRevision?.id).length})
              </summary>
              {d.versions
                .filter((v) => v.id !== currentRevision?.id)
                .slice()
                .reverse()
                .map((v) => (
                  <article className="revisionblock" key={v.id}>
                    <QuoteRevisionActions
                      data={data}
                      deal={d}
                      revision={v}
                      busy={busy}
                      dirty={dirty}
                      onSave={onSave}
                      onPrint={() => onPrint(v)}
                      onError={setLocalError}
                    />
                  </article>
                ))}
              {d.versions.length <= 1 && <p>No hay revisiones anteriores.</p>}
            </details>
          </div>
        )}
        {tab === 'Notas' && (
          <div>
            <h3>Historial de notas</h3>
            {data.notes
              .filter((n) => n.dealId === d.id)
              .map((n) => (
                <div className="note" key={n.id}>
                  <p>{n.text}</p>
                  <small>
                    {n.owner} · {new Date(n.date).toLocaleString('es-ES')}
                  </small>
                </div>
              ))}
            <PermissionForm
              action="deals"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                const n = structuredClone(data);
                n.notes.push({
                  id: recordId(),
                  dealId: d.id,
                  text: note.trim(),
                  date: new Date().toISOString(),
                  owner: profile,
                });
                if (await onSave(n)) setNote('');
              }}
            >
              <label>
                Nueva nota
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                  maxLength={4000}
                />
              </label>
              <PermissionButton action="deals" disabled={busy}>
                Guardar nota
              </PermissionButton>
            </PermissionForm>
          </div>
        )}
      </section>
    </div>
  );
}
