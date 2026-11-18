'use client';
import { useEffect, useRef, useState } from 'react';
import type { Data } from '../../domain/model';
import { FormDialog } from './dialog';
import { PermissionButton, PermissionForm } from './permission-controls';
import { recordId } from '../utils/record-id';
type Entry = {
  id: string;
  kind: string;
  title: string;
  text: string;
  author: string;
  date: string;
  plannedDate?: boolean;
  dateOnly?: boolean;
  dealId?: string;
  dealTitle?: string;
  recipient?: string;
};
export default function CompanyHistory({
  companyId,
  data,
  onOpenDeal,
}: {
  companyId: string;
  data: Data;
  onOpenDeal: (id: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [total, setTotal] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(false),
    [text, setText] = useState(''),
    [kind, setKind] = useState('Nota');
  const noteId = useRef(recordId());
  async function load(offset = 0) {
    const r = await fetch(
        '/api/company-history?company=' + encodeURIComponent(companyId) + '&offset=' + offset,
      ),
      b = await r.json();
    if (!r.ok) throw Error(b.error);
    setEntries((old) => (offset ? [...old, ...b.entries] : b.entries));
    setTotal(b.total);
    setMore(b.more);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [companyId, data]);
  function close() {
    if (!busy && (!text.trim() || confirm('¿Cerrar sin guardar esta nota?'))) setEditing(false);
  }
  return (
    <section className="card company-history">
      <div className="sectionhead">
        <div>
          <h2>Historial y conversaciones</h2>
          <p>Lo que habéis hablado y realizado con esta empresa.</p>
        </div>
        <PermissionButton action="companies" onClick={() => setEditing(true)}>
          Añadir nota o conversación
        </PermissionButton>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="muted">
        {total} registros · Notas, actividades completadas y presupuestos enviados desde el CRM.
      </p>
      {entries.length === 0 && !error && (
        <p>Aún no hay conversaciones registradas. Puedes añadir una nota sin crear un trato.</p>
      )}
      <ol className="company-timeline">
        {entries.map((e) => (
          <li key={e.id}>
            <div className="timeline-heading">
              <strong>{e.title}</strong>
              <span className="badge">{e.kind}</span>
            </div>
            <small>
              {e.author} · {e.plannedDate ? 'Fecha prevista: ' : ''}
              {new Date(e.date).toLocaleString(
                'es-ES',
                e.plannedDate || e.dateOnly
                  ? { dateStyle: 'short' }
                  : { dateStyle: 'short', timeStyle: 'short' },
              )}
            </small>
            {e.plannedDate && <small>Completada; no consta la fecha exacta de realización.</small>}
            {e.recipient && <p>Para: {e.recipient}</p>}
            {e.text &&
              (e.kind === 'Correo enviado' ? (
                <details>
                  <summary>Ver mensaje enviado</summary>
                  <p className="timeline-text">{e.text}</p>
                </details>
              ) : (
                <p className="timeline-text">{e.text}</p>
              ))}
            {e.dealId && (
              <button type="button" className="recordlink" onClick={() => onOpenDeal(e.dealId!)}>
                {e.dealTitle || 'Abrir trato'}
              </button>
            )}
          </li>
        ))}
      </ol>
      {more && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await load(entries.length);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Ver más historial
        </button>
      )}
      {editing && (
        <FormDialog title="Registrar conversación" onClose={close}>
          <h2>Añadir nota o conversación</h2>
          <p>
            La fecha y tu nombre se guardan automáticamente. Esto no programa una actividad ni envía
            correos.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <PermissionForm
            action="companies"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const r = await fetch('/api/company-history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: noteId.current, companyId, kind, text }),
                  }),
                  b = await r.json();
                if (!r.ok) throw Error(b.error);
                setText('');
                setKind('Nota');
                noteId.current = recordId();
                setEditing(false);
                setNotice('Conversación guardada.');
                await load();
                window.dispatchEvent(new Event('crm:server-change'));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Tipo
              <select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value)}>
                {['Nota', 'Llamada', 'Reunión', 'Correo'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              ¿Qué habéis hablado?
              <textarea
                required
                maxLength={4000}
                rows={5}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ej.: He hablado con Ana. Quiere revisar el acabado y nos responde el viernes."
              />
            </label>
            <PermissionButton action="companies" disabled={busy || !text.trim()}>
              {busy ? 'Guardando…' : 'Guardar en el historial'}
            </PermissionButton>
          </PermissionForm>
        </FormDialog>
      )}
    </section>
  );
}
