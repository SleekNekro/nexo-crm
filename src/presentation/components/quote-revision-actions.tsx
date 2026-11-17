'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import QuoteEmail from './quote-email';
import { acceptQuote, markQuoteSent } from '../../domain/actions';
import { suggestedFollowUp, revisionFollowUp } from '../../domain/quote-workflow';
import type { Data, Deal } from '../../domain/model';
import { money, total } from '../../domain/model';
import { PermissionButton, PermissionForm } from './permission-controls';
import { localDay } from './activity-list';
import { recordId } from '../utils/record-id';
export default function QuoteRevisionActions({
  data,
  deal,
  revision,
  busy,
  dirty,
  onSave,
  onPrint,
  onError,
  showPdf = true,
}: {
  showPdf?: boolean;
  data: Data;
  deal: Deal;
  revision: Deal['versions'][number];
  busy: boolean;
  dirty: boolean;
  onSave: (data: Data) => Promise<boolean | undefined>;
  onPrint: () => void;
  onError: (message: string) => void;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [success, setSuccess] = useState('');
  const [due, setDue] = useState(() => suggestedFollowUp(localDay()));
  const followUp = revisionFollowUp(data, deal.id, revision.id);
  const closed = ['Ganado', 'Perdido'].includes(deal.stage),
    accepted = deal.acceptedRevisionId === revision.id;
  return (
    <div className="quote-revision-actions">
      {success && (
        <p role="status" className="draftnotice">
          {success}
        </p>
      )}
      <p>
        <strong>
          {revision.number ||
            'Revisión ' + (deal.versions.findIndex((v) => v.id === revision.id) + 1)}
        </strong>{' '}
        · {money(total(revision.lines))} con IVA ·{' '}
        {accepted ? 'Aceptado' : revision.sentAt ? 'Envío registrado' : 'Sin envío registrado'}
      </p>
      {emailOpen && (
        <QuoteEmail
          data={data}
          deal={deal}
          revision={revision}
          onPrint={onPrint}
          onClose={() => setEmailOpen(false)}
        />
      )}
      <div className="quoteactions">
        {!closed && (
          <PermissionButton
            action="deals,tasks"
            className="primary icon-action quote-email-action"
            disabled={busy || dirty}
            onClick={() => setEmailOpen(true)}
          >
            <Send size={18} aria-hidden="true" /> Enviar por correo
          </PermissionButton>
        )}
        {showPdf && (
          <button disabled={busy} onClick={onPrint}>
            Abrir PDF
          </button>
        )}
        {!deal.acceptedRevisionId && !data.orders.some((o) => o.dealId === deal.id) && (
          <PermissionButton
            action="deals,orders,tasks"
            disabled={busy || dirty || deal.stage === 'Perdido'}
            onClick={async () => {
              if (
                !confirm(
                  '¿Aceptar ' +
                    (revision.number || 'esta revisión') +
                    ' por ' +
                    money(total(revision.lines)) +
                    '? Se generará el pedido y se cerrarán los seguimientos pendientes. La obra seguirá siendo opcional.',
                )
              )
                return;
              try {
                if (await onSave(acceptQuote(data, deal.id, revision.id, localDay(), recordId)))
                  setSuccess('Presupuesto aceptado y pedido generado.');
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          >
            Aceptar y generar pedido
          </PermissionButton>
        )}
      </div>
      {!revision.sentAt && !closed && (
        <PermissionForm
          action="deals,tasks"
          className="quote-send-inline"
          onSubmit={async (e) => {
            e.preventDefault();
            onError('');
            try {
              const saved = await onSave(
                markQuoteSent(data, deal.id, revision.id, new Date().toISOString(), due, recordId),
              );
              if (saved)
                setSuccess(
                  'Envío registrado. Trato pendiente del cliente y seguimiento para el ' +
                    new Date(due + 'T12:00:00').toLocaleDateString('es-ES') +
                    '.',
                );
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
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
          <PermissionButton action="deals,tasks" disabled={busy || dirty}>
            Marcar como enviado
          </PermissionButton>
          <p>
            Registra un envío que ya has realizado. No envía correos. Pasa a «Pendiente del cliente»
            y crea el seguimiento de prioridad media.
          </p>
        </PermissionForm>
      )}
      {revision.sentAt && (
        <p className="muted">
          {followUp.state === 'pending'
            ? 'Seguimiento pendiente: ' +
              new Date(followUp.due + 'T12:00:00').toLocaleDateString('es-ES') +
              ' · ' +
              followUp.title
            : followUp.state === 'completed'
              ? 'Seguimiento completado. No hay otro pendiente para esta revisión.'
              : followUp.state === 'cancelled'
                ? 'Seguimiento cerrado o sustituido.'
                : 'Sin seguimiento pendiente para esta revisión.'}
        </p>
      )}
      {accepted && (
        <p className="draftnotice">Pedido generado. Puedes gestionarlo desde Pedidos.</p>
      )}
    </div>
  );
}
