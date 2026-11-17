'use client';
import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import type { Data, Deal } from '../../domain/model';
import { money, total } from '../../domain/model';
import { suggestedFollowUp } from '../../domain/quote-workflow';
import { localDay } from './activity-list';
import { FormDialog } from './dialog';
import MailSettings from './mail-settings';
import { recordId } from '../utils/record-id';
import { quoteDocument } from '../documents/quote-document';
type Entry = {
  id: string;
  revisionId?: string;
  status: string;
  recipient: string;
  subject: string;
  sender: string;
  message: string;
  createdAt: string;
  error?: string;
  canResolve?: boolean;
};
export default function QuoteEmail({
  data,
  deal,
  revision,
  onClose,
  onPrint,
}: {
  data: Data;
  deal: Deal;
  revision: Deal['versions'][number];
  onClose: () => void;
  onPrint: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const [account, setAccount] = useState<any>(null),
    [loaded, setLoaded] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<Entry | null>(null),
    [settings, setSettings] = useState(false),
    [dirty, setDirty] = useState(false);
  const [to, setTo] = useState(
    data.companies.find((c) => c.id === deal.companyId)?.email?.trim() || '',
  );
  const [subject, setSubject] = useState(
      'Presupuesto ' + (revision.number || '') + ' · ' + (revision.snapshot?.title || deal.title),
    ),
    [body, setBody] = useState(
      'Hola,\n\nTe adjunto nuestro presupuesto. Quedo a tu disposición para cualquier consulta.\n\nUn saludo,',
    ),
    [due, setDue] = useState(() => suggestedFollowUp(localDay()));
  const signatureAdded = useRef(false),
    attempt = useRef<{ id: string; payload: any } | null>(null);
  async function load() {
    const [a, h] = await Promise.all([
      fetch('/api/mail-settings'),
      fetch('/api/quote-mail?deal=' + encodeURIComponent(deal.id)),
    ]);
    const ab = await a.json(),
      hb = await h.json();
    if (!a.ok || !h.ok) throw Error(ab.error || hb.error);
    setAccount(ab.account);
    setEntries(hb.entries.filter((e: Entry) => e.revisionId === revision.id));
    setLoaded(true);
    if (attempt.current) {
      const found = hb.entries.find((e: Entry) => e.id === attempt.current?.id);
      if (found) {
        setResult(found);
        if (found.status === 'failed') attempt.current = null;
      } else attempt.current = null;
    }
    if (!signatureAdded.current && ab.account?.signature) {
      setBody((b) => b + '\n\n' + ab.account.signature);
      signatureAdded.current = true;
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  function close() {
    if (!busy && (!dirty || result || confirm('¿Cerrar el correo sin enviarlo?'))) onClose();
  }
  async function check() {
    setBusy(true);
    setError('');
    try {
      await load();
      window.dispatchEvent(new Event('crm:server-change'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = entries.some((e) =>
    ['preparing', 'sending', 'accepted', 'unknown'].includes(e.status),
  );
  const sent = entries.some((e) => e.status === 'sent');
  return (
    <FormDialog title="Enviar presupuesto" onClose={close}>
      <h2>Enviar presupuesto</h2>
      <p>
        <strong>{revision.number || 'Revisión ' + (deal.versions.indexOf(revision) + 1)}</strong> ·{' '}
        {money(total(revision.lines))} con IVA
      </p>
      <p>
        Se adjunta el PDF de esta revisión, con el mismo diseño y contenido que ya has generado.
      </p>
      <button type="button" disabled={busy} onClick={() => setPreview(true)}>
        Revisar presupuesto
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && <p role="status">{result.message}</p>}
      {!loaded ? (
        <p>Cargando correo…</p>
      ) : !account?.verified_at ? (
        <>
          <p>Antes de enviar, configura y comprueba tu correo.</p>
          <button className="primary icon-action" type="button" onClick={() => setSettings(true)}>
            <Mail size={20} aria-hidden="true" /> Configurar mi correo
          </button>
        </>
      ) : (
        <form
          onChange={() => setDirty(true)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            if (
              sent &&
              !attempt.current &&
              !confirm('Esta revisión ya se ha enviado. ¿Enviar otra copia?')
            )
              return;
            setBusy(true);
            setError('');
            const payload = attempt.current?.payload || {
              id: recordId(),
              dealId: deal.id,
              revisionId: revision.id,
              recipient: to.trim(),
              subject,
              body,
              due,
              resend: sent,
            };
            attempt.current = { id: payload.id, payload };
            try {
              const r = await fetch('/api/quote-mail', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                }),
                b = await r.json();
              if (!r.ok) {
                attempt.current = null;
                throw Error(b.error);
              }
              setResult(b);
              setDirty(false);
              if (b.status === 'failed') attempt.current = null;
              await load();
              window.dispatchEvent(new Event('crm:server-change'));
            } catch (e) {
              setError(
                (e as Error).message ||
                  'No se recibió confirmación. Consulta el estado antes de repetir.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset
            className="mail-fields"
            disabled={
              busy || pending || !!attempt.current || (!!result && result.status !== 'failed')
            }
          >
            <p>
              Desde:{' '}
              <strong>
                {account.name} · {account.email}
              </strong>
            </p>
            <label>
              Para
              <input
                type="email"
                required
                maxLength={254}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              Asunto
              <input
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Mensaje
              <textarea
                required
                maxLength={12000}
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            {!revision.sentAt && (
              <label>
                Próximo seguimiento
                <input
                  type="date"
                  required
                  min={localDay()}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
            )}
            <button type="submit">
              {busy
                ? 'Enviando…'
                : sent
                  ? 'Enviar otra copia con PDF'
                  : 'Enviar presupuesto con PDF'}
            </button>
          </fieldset>
        </form>
      )}
      {(entries.length > 0 || attempt.current) && (
        <section>
          <h3>Historial de esta revisión</h3>
          <button type="button" disabled={busy} onClick={check}>
            Actualizar estado
          </button>
          {entries.map((entry) => (
            <div className="mail-history" key={entry.id}>
              <strong>{new Date(entry.createdAt).toLocaleString('es-ES')}</strong>
              <p>
                {entry.sender} → {entry.recipient}
              </p>
              <p>{entry.message}</p>
              {entry.status === 'unknown' && entry.canResolve && (
                <div className="mail-actions">
                  {(['sent', 'failed'] as const).map((outcome) => (
                    <button
                      type="button"
                      key={outcome}
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !confirm(
                            outcome === 'sent'
                              ? '¿Has comprobado con tu proveedor que se envió este correo? Se registrará el envío sin mandar otra copia.'
                              : '¿Has comprobado con tu proveedor que NO se envió? Se permitirá un nuevo intento manual.',
                          )
                        )
                          return;
                        setBusy(true);
                        setError('');
                        try {
                          const r = await fetch('/api/quote-mail', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'resolve',
                              id: entry.id,
                              outcome,
                              confirmed: true,
                            }),
                          });
                          const b = await r.json();
                          if (!r.ok) throw Error(b.error);
                          setResult(null);
                          attempt.current = null;
                          await load();
                          window.dispatchEvent(new Event('crm:server-change'));
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {outcome === 'sent'
                        ? 'He comprobado que se envió'
                        : 'He comprobado que no se envió'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      <p className="muted">
        La aceptación del servidor no confirma que el destinatario lo haya leído. No se reenvían
        mensajes automáticamente.
      </p>
      {preview && (
        <FormDialog title="Vista previa del presupuesto" onClose={() => setPreview(false)}>
          <h2>{revision.number || 'Presupuesto generado'}</h2>
          <p>La misma revisión que se adjuntará al correo.</p>
          <iframe
            title="Presupuesto generado"
            sandbox=""
            style={{ width: '100%', height: '70vh', border: '1px solid #ddd' }}
            srcDoc={quoteDocument(
              deal,
              revision,
              data.companies.find((c) => c.id === deal.companyId),
              data.contacts.find((c) => c.id === deal.contactId),
              '/brand/nexo-print-logo.png',
            ).replace('</style>', '.toolbar{display:none}</style>')}
          />
        </FormDialog>
      )}
      {settings && (
        <MailSettings
          displayName=""
          onClose={() => {
            setSettings(false);
            load().catch((e) => setError(e.message));
          }}
        />
      )}
    </FormDialog>
  );
}
