'use client';
import { useViewAccess } from './module';
import { readSpreadsheet } from '../utils/read-spreadsheet';
import { useState } from 'react';
import type { Data } from '../../domain/model';
import {
  parseCsv,
  suggestColumns,
  companyFields,
  contactFields,
  normalized,
  type ImportKind,
  type ColumnMap,
} from '../../domain/commercial-import';
import {
  mergeCompanyFields,
  mergeContactFields,
  type MergeChoices,
} from '../../domain/commercial-merge';
import { possibleDuplicates } from '../../domain/commercial-followup';
import { FormDialog } from './dialog';
import AssigneeSelect from './assignee-select';
type PreviewRow = {
  row: number;
  name: string;
  company?: string;
  error: string;
  duplicates: string[];
  values: Record<string, string>;
};
type MergePreview = {
  version: number;
  source: Record<string, string>;
  target: Record<string, string>;
  result: Record<string, string>;
  impact: Record<string, number>;
};
type Audit = {
  id: string;
  at: string;
  actor_name: string;
  action: string;
  kind: string;
  detail: {
    count?: number;
    source?: Record<string, string>;
    targetBefore?: Record<string, string>;
    result?: Record<string, string>;
    records?: Record<string, string>[];
    impact?: Record<string, number>;
  };
};
const labels: Record<string, string> = {
  ...companyFields,
  ...contactFields,
  owner: 'Responsable',
  status: 'Estado comercial',
};
export default function CommercialDataTools({
  data,
  onChanged,
}: {
  data: Data;
  onChanged: () => Promise<unknown>;
}) {
  const canView = useViewAccess();
  const canMerge = [
    'Empresas',
    'Contactos',
    'Tratos',
    'Presupuestos',
    'Actividades',
    'Pedidos',
  ].every(canView);
  const [sheets, setSheets] = useState<{ name: string; csv: string }[]>([]);
  const [sheetName, setSheetName] = useState('');
  function chooseSheet(sheet: { name: string; csv: string }) {
    invalidate();
    const parsed = parseCsv(sheet.csv);
    setCsv(sheet.csv);
    setSheetName(sheet.name);
    setHeaders(parsed.headers);
    setMapping(suggestColumns(parsed.headers, kind));
  }
  const [mode, setMode] = useState<'' | 'import' | 'merge' | 'history'>('');
  const [kind, setKind] = useState<ImportKind>('companies');
  const [csv, setCsv] = useState(''),
    [filename, setFilename] = useState(''),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<ColumnMap>({}),
    [owner, setOwner] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [version, setVersion] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState(''),
    [targetId, setTargetId] = useState(''),
    [choices, setChoices] = useState<MergeChoices>({}),
    [merge, setMerge] = useState<MergePreview | null>(null);
  const [events, setEvents] = useState<Audit[]>([]),
    [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const invalidate = () => {
    setRows([]);
    setSelected([]);
    setVersion(null);
    setMerge(null);
    setError('');
  };
  function close() {
    if (busy) return;
    if (
      (csv || merge) &&
      !window.confirm('¿Cerrar sin aplicar esta vista previa? No se han guardado cambios.')
    )
      return;
    setMode('');
    setCsv('');
    setFilename('');
    invalidate();
  }
  function start(value: typeof mode) {
    setMode(value);
    setSheets([]);
    setSheetName('');
    setKind('companies');
    setSourceId('');
    setTargetId('');
    setChoices({});
    setCsv('');
    setFilename('');
    setHeaders([]);
    invalidate();
    setSuccess('');
    if (value === 'history') void history();
  }
  async function request(body: unknown) {
    const r = await fetch('/api/commercial-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error || 'No se pudo completar la operación');
    return b;
  }
  async function history(before?: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(
        '/api/commercial-data' + (before ? '?before=' + encodeURIComponent(before) : ''),
      );
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setEvents((old) => (before ? [...old, ...b.events] : b.events));
      setMore(b.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function file(file?: File) {
    if (!file) return;
    invalidate();
    setCsv('');
    setSheets([]);
    setSheetName('');
    setFilename('');
    setHeaders([]);
    setBusy(true);
    try {
      if (file.size > 1_000_000) throw Error('Máximo 1 MB por archivo.');
      const bytes = await file.arrayBuffer();
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const list = await readSpreadsheet(bytes);
        if (!list.length) throw Error('No hay hojas visibles con datos');
        setSheets(list);
        chooseSheet(list[0]);
        setFilename(file.name);
        return;
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const parsed = parseCsv(text);
      setCsv(text);
      setFilename(file.name);
      setHeaders(parsed.headers);
      setMapping(suggestColumns(parsed.headers, kind));
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Guarda el archivo como CSV UTF-8 y vuelve a seleccionarlo.'
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const command = () =>
    mode === 'import'
      ? { action: 'import', kind, csv, mapping, owner, selected }
      : { action: 'merge', kind, sourceId, targetId, choices };
  async function preview() {
    setBusy(true);
    setError('');
    setMerge(null);
    setRows([]);
    setSelected([]);
    setVersion(null);
    try {
      const b = await request({ ...command(), preview: true });
      setVersion(b.version);
      if (mode === 'import') {
        setRows(b.rows);
        setSelected(
          b.rows
            .filter((r: PreviewRow) => !r.error && !r.duplicates.length)
            .map((r: PreviewRow) => r.row),
        );
      } else setMerge(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (busy || version === null) return;
    setBusy(true);
    setError('');
    try {
      await request({ ...command(), version, preview: false });
      setSuccess(
        mode === 'import'
          ? `${selected.length} registros importados.`
          : 'Fusión completada. Las relaciones y el historial se han conservado.',
      );
      setMode('');
      setCsv('');
      invalidate();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
      setVersion(null);
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const content =
      kind === 'companies'
        ? 'Nombre;CIF;Correo;Teléfono;Ciudad;Estado comercial\nEmpresa de ejemplo;B12345678;contacto@example.com;910000000;Madrid;Posible cliente\n'
        : 'Nombre;Empresa;Correo;Teléfono;Cargo\nContacto de ejemplo;B12345678;persona@example.com;610000000;Compras\n';
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla-${kind === 'companies' ? 'empresas' : 'contactos'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const source = data[kind].find((r) => r.id === sourceId);
  const candidates = data[kind].filter(
    (r) =>
      r.id !== sourceId &&
      (kind === 'companies' ||
        !source ||
        ('companyId' in r && 'companyId' in source && r.companyId === source.companyId)),
  );
  const suggestions = source
    ? candidates.filter(
        (r) =>
          normalized(r.name) === normalized(source.name) || possibleDuplicates([r], source).length,
      )
    : [];
  const fields = kind === 'companies' ? companyFields : contactFields;
  return (
    <>
      <div className="commercial-data-actions">
        <button onClick={() => start('import')}>Importar empresas / contactos</button>
        {canMerge && <button onClick={() => start('merge')}>Fusionar duplicados</button>}
        {canMerge && (
          <button onClick={() => start('history')}>Historial de importaciones y fusiones</button>
        )}
      </div>
      {success && (
        <p role="status" className="draftnotice">
          {success}
        </p>
      )}
      {!!mode && (
        <FormDialog
          title={
            mode === 'import'
              ? 'Importar empresas y contactos'
              : mode === 'merge'
                ? 'Fusionar duplicados'
                : 'Historial de datos comerciales'
          }
          onClose={close}
        >
          <div className="commercial-data-tool">
            <h2>
              {mode === 'import'
                ? 'Importar con vista previa'
                : mode === 'merge'
                  ? 'Fusionar duplicados'
                  : 'Historial de datos comerciales'}
            </h2>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {mode !== 'history' && (
              <label>
                Tipo de registro
                <select
                  disabled={busy}
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as ImportKind;
                    setKind(k);
                    setSourceId('');
                    setTargetId('');
                    setChoices({});
                    invalidate();
                    if (csv) setMapping(suggestColumns(headers, k));
                  }}
                >
                  <option value="companies">Empresas</option>
                  {canView('Contactos') && <option value="contacts">Contactos</option>}
                </select>
              </label>
            )}
            {mode === 'import' && (
              <>
                <p>
                  Excel (.xlsx) o CSV UTF-8 con cabeceras. Máximo 1.000 filas y 1 MB. Primero
                  importa las empresas; después sus contactos. No se modifica ninguna ficha
                  existente.
                </p>
                <button disabled={busy} onClick={template}>
                  Descargar plantilla de ejemplo
                </button>
                <label>
                  Archivo Excel o CSV
                  <input
                    type="file"
                    accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={busy}
                    onChange={(e) => {
                      void file(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {filename && <p>{filename}</p>}
                {sheets.length > 1 && (
                  <label>
                    Hoja de Excel
                    <select
                      disabled={busy}
                      value={sheetName}
                      onChange={(e) => chooseSheet(sheets.find((s) => s.name === e.target.value)!)}
                    >
                      {sheets.map((s) => (
                        <option key={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {headers.length > 0 && (
                  <>
                    <h3>1. Relacionar columnas</h3>
                    <div className="import-mapping">
                      {Object.entries(fields).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          {['name', 'company'].includes(key) ? ' *' : ''}
                          <select
                            disabled={busy}
                            value={mapping[key] ?? -1}
                            onChange={(e) => {
                              setMapping({ ...mapping, [key]: Number(e.target.value) });
                              invalidate();
                            }}
                          >
                            <option value={-1}>No importar este campo</option>
                            {headers.map((h, i) => (
                              <option key={i} value={i}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    {kind === 'companies' && (
                      <label>
                        Responsable de las empresas importadas
                        <AssigneeSelect
                          disabled={busy}
                          value={owner}
                          onChange={(value) => {
                            setOwner(value);
                            invalidate();
                          }}
                        />
                      </label>
                    )}
                    <button disabled={busy} onClick={() => void preview()}>
                      {busy ? 'Revisando…' : 'Generar vista previa'}
                    </button>
                  </>
                )}
                {rows.length > 0 && (
                  <>
                    <h3>2. Revisar antes de importar</h3>
                    <p>
                      {selected.length} seleccionadas · {rows.filter((r) => r.error).length} con
                      errores · {rows.filter((r) => !r.error && r.duplicates.length).length}{' '}
                      posibles duplicados. Las filas con errores o coincidencias se omiten.
                    </p>
                    <label className="import-select">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={
                          selected.length > 0 &&
                          selected.length ===
                            rows.filter((r) => !r.error && !r.duplicates.length).length
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? rows
                                  .filter((r) => !r.error && !r.duplicates.length)
                                  .map((r) => r.row)
                              : [],
                          )
                        }
                      />
                      Seleccionar todas las filas válidas
                    </label>
                    <div className="import-preview">
                      {rows.map((r) => (
                        <article key={r.row}>
                          <label className="import-select">
                            <input
                              type="checkbox"
                              disabled={busy || !!r.error || !!r.duplicates.length}
                              checked={selected.includes(r.row)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, r.row]
                                    : selected.filter((n) => n !== r.row),
                                )
                              }
                            />
                            Fila {r.row} · {r.name || 'Sin nombre'}
                          </label>
                          {r.company && <p>Empresa: {r.company}</p>}
                          {r.error ? (
                            <p className="error">{r.error}</p>
                          ) : r.duplicates.length ? (
                            <p>Posible duplicado: {r.duplicates.join(', ')}. Se omitirá.</p>
                          ) : (
                            <p>Se creará un registro nuevo.</p>
                          )}
                          <details>
                            <summary>Ver datos de esta fila</summary>
                            <dl>
                              {Object.entries(r.values || {})
                                .filter(([k, v]) => labels[k] && v)
                                .map(([k, v]) => (
                                  <div key={k}>
                                    <dt>{labels[k]}</dt>
                                    <dd>{v}</dd>
                                  </div>
                                ))}
                            </dl>
                          </details>
                        </article>
                      ))}
                    </div>
                    <button
                      className="primary full"
                      disabled={busy || version === null || !selected.length}
                      onClick={() => void commit()}
                    >
                      {busy ? 'Importando…' : `Importar ${selected.length} registros seleccionados`}
                    </button>
                  </>
                )}
              </>
            )}
            {mode === 'merge' && (
              <>
                <p>
                  La ficha duplicada se retirará de la lista y sus relaciones pasarán a la ficha que
                  conservas. Los datos originales quedarán en este historial. Los presupuestos
                  emitidos no cambiarán de cliente en su PDF.
                </p>
                <label>
                  Ficha duplicada que se retirará
                  <select
                    disabled={busy}
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setTargetId('');
                      setChoices({});
                      invalidate();
                    }}
                  >
                    <option value="">Selecciona un registro</option>
                    {data[kind].map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {'taxId' in r ? r.taxId || r.email : r.email}
                        {'companyId' in r
                          ? ' · ' + data.companies.find((c) => c.id === r.companyId)?.name
                          : ''}{' '}
                        · {r.id.slice(-6)}
                      </option>
                    ))}
                  </select>
                </label>
                {suggestions.length > 0 && (
                  <p>Posibles coincidencias: {suggestions.map((r) => r.name).join(', ')}.</p>
                )}
                <label>
                  Ficha que se conserva
                  <select
                    disabled={busy || !sourceId}
                    value={targetId}
                    onChange={(e) => {
                      setTargetId(e.target.value);
                      setChoices({});
                      invalidate();
                    }}
                  >
                    <option value="">Selecciona el destino</option>
                    {candidates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {'taxId' in r ? r.taxId || r.email : r.email} · {r.id.slice(-6)}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={busy || !sourceId || !targetId} onClick={() => void preview()}>
                  {busy ? 'Revisando…' : 'Revisar fusión'}
                </button>
                {merge && (
                  <>
                    <h3>Datos que se conservarán</h3>
                    <p>
                      Se conserva el valor del destino y se completan los campos vacíos. Puedes
                      elegir otro valor. Los valores descartados siguen disponibles en el historial.
                    </p>
                    <div className="import-mapping">
                      {(kind === 'companies' ? mergeCompanyFields : mergeContactFields).map(
                        (field) => (
                          <label key={field}>
                            {labels[field]}
                            <select
                              disabled={busy}
                              value={choices[field] || ''}
                              onChange={(e) => {
                                const next = { ...choices };
                                if (e.target.value)
                                  next[field] = e.target.value as 'source' | 'target';
                                else delete next[field];
                                setChoices(next);
                                setVersion(null);
                              }}
                            >
                              <option value="">
                                Automático: {merge.result[field] || '(vacío)'}
                              </option>
                              <option value="target">
                                Conservar destino: {merge.target[field] || '(vacío)'}
                              </option>
                              <option value="source">
                                Usar duplicado: {merge.source[field] || '(vacío)'}
                              </option>
                            </select>
                          </label>
                        ),
                      )}
                    </div>
                    {version === null && (
                      <p className="draftnotice">
                        Has cambiado los valores. Pulsa «Revisar fusión» para actualizar la vista
                        previa.
                      </p>
                    )}
                    <p>
                      Se vincularán {merge.impact.contacts} contactos, {merge.impact.deals} tratos,{' '}
                      {merge.impact.quotes} revisiones de presupuesto, {merge.impact.orders}{' '}
                      pedidos, {merge.impact.tasks} actividades, {merge.impact.works} obras y{' '}
                      {merge.impact.companyNotes || 0} notas de empresa. Los responsables de los
                      tratos y obras se mantienen.
                    </p>
                    <button
                      className="primary full"
                      disabled={busy || version === null}
                      onClick={() => void commit()}
                    >
                      {busy ? 'Fusionando…' : `Confirmar fusión en ${merge.target.name}`}
                    </button>
                  </>
                )}
              </>
            )}
            {mode === 'history' && (
              <>
                <p>
                  Registro de operaciones masivas. Los datos originales de una fusión se conservan
                  aquí, aunque la ficha duplicada ya no aparezca en las listas.
                </p>
                {!events.length && !busy && <p>Todavía no hay operaciones registradas.</p>}
                {events.map((e) => (
                  <article className="card" key={e.id}>
                    <strong>
                      {e.action === 'merge' ? 'Fusión' : 'Importación'} de{' '}
                      {e.kind === 'companies' ? 'empresas' : 'contactos'}
                    </strong>
                    <p>
                      {new Date(e.at).toLocaleString('es-ES')} · {e.actor_name}
                    </p>
                    {e.detail.count != null && <p>{e.detail.count} registros importados</p>}
                    {e.detail.source && (
                      <p>
                        {e.detail.source.name} → {e.detail.result?.name}
                      </p>
                    )}
                    <details>
                      <summary>Ver datos conservados</summary>
                      {[e.detail.source, e.detail.targetBefore, e.detail.result].map(
                        (record, i) =>
                          record && (
                            <section key={i}>
                              <h4>
                                {
                                  ['Duplicado original', 'Destino antes de fusionar', 'Resultado'][
                                    i
                                  ]
                                }
                              </h4>
                              <dl>
                                {Object.entries(record)
                                  .filter(([k]) => labels[k])
                                  .map(([k, v]) => (
                                    <div key={k}>
                                      <dt>{labels[k]}</dt>
                                      <dd>{v || '—'}</dd>
                                    </div>
                                  ))}
                              </dl>
                            </section>
                          ),
                      )}
                      {e.detail.records?.map((r) => (
                        <p key={r.id}>
                          {r.name} · {r.email || r.phone || 'Sin contacto'}
                        </p>
                      ))}
                    </details>
                  </article>
                ))}
                {more && (
                  <button disabled={busy} onClick={() => void history(events.at(-1)?.id)}>
                    Ver operaciones anteriores
                  </button>
                )}
              </>
            )}
          </div>
        </FormDialog>
      )}
    </>
  );
}
