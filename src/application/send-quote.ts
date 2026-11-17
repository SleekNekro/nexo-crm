import { validMailbox } from '../domain/mail-settings.ts';
import { randomUUID, createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { Identity } from './access';
import type { Data, Deal, Company, Contact } from '../domain/model';
import { visibleData } from './access.ts';
import { canAct } from '../domain/permissions.ts';
import { markQuoteSent } from '../domain/actions.ts';
import { lockEntities, readEntities, writeEntities } from '../infrastructure/entity-store.ts';
import { recordSales } from '../infrastructure/sales-storage.ts';
export const quoteMailSchema = `CREATE TABLE IF NOT EXISTS crm_quote_mail (
 id text PRIMARY KEY,deal_id text NOT NULL,revision_id text NOT NULL,user_id text NOT NULL,recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,sender text NOT NULL,sender_name text NOT NULL,account_version integer NOT NULL,due text NOT NULL,request_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('preparing','sending','accepted','sent','failed','unknown')),message_id text NOT NULL,pdf bytea,filename text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),accepted_at timestamptz,error text);
 CREATE INDEX IF NOT EXISTS crm_quote_mail_deal ON crm_quote_mail(deal_id,created_at DESC);
 CREATE UNIQUE INDEX IF NOT EXISTS crm_quote_mail_inflight ON crm_quote_mail(revision_id) WHERE status IN ('preparing','sending','accepted','unknown');`;
export type SendRequest = {
  id: string;
  dealId: string;
  revisionId: string;
  recipient: string;
  subject: string;
  body: string;
  due: string;
  resend?: boolean;
};
export type SendDependencies = {
  pdf: (
    deal: Deal,
    revision: Deal['versions'][number],
    company?: Company,
    contact?: Contact,
  ) => Promise<Buffer>;
  deliver: (account: any, mail: any) => Promise<void>;
  reauthorize: () => Promise<Identity | null>;
};
export function validateSend(b: any): asserts b is SendRequest {
  if (
    !b ||
    !/^[a-f0-9-]{36}$/i.test(b.id) ||
    typeof b.dealId !== 'string' ||
    b.dealId.length > 150 ||
    typeof b.revisionId !== 'string' ||
    b.revisionId.length > 150
  )
    throw Error('Solicitud de envío no válida.');
  if (!validMailbox(b.recipient)) throw Error('Introduce un único destinatario válido.');
  if (
    typeof b.subject !== 'string' ||
    !b.subject.trim() ||
    b.subject.length > 200 ||
    /[\x00-\x1f\x7f]/.test(b.subject) ||
    typeof b.body !== 'string' ||
    !b.body.trim() ||
    b.body.length > 12000
  )
    throw Error('Revisa el asunto y el mensaje.');
  if (typeof b.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.due))
    throw Error('Indica el próximo seguimiento.');
}
function authorized(data: Data, u: Identity, dealId: string, revisionId: string) {
  if (!canAct(u, 'deals') || !canAct(u, 'tasks') || u.mustChange)
    throw Error('Sin permiso para enviar presupuestos.');
  const visible = visibleData(data, u),
    deal = visible.deals.find((d) => d.id === dealId),
    revision = deal?.versions.find((v) => v.id === revisionId);
  if (!deal || !revision) throw Error('Presupuesto no disponible.');
  return {
    deal,
    revision,
    company: visible.companies.find((c) => c.id === deal.companyId),
    contact: visible.contacts.find((c) => c.id === deal.contactId),
  };
}
export function publicMail(row: any) {
  return {
    id: row.id,
    status: row.status,
    recipient: row.recipient,
    subject: row.subject,
    sender: row.sender,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    error: row.error,
    message:
      row.status === 'sent'
        ? 'Correo aceptado por el servidor. Envío y seguimiento registrados.'
        : row.status === 'accepted'
          ? 'Correo aceptado; pendiente de actualizar el seguimiento. Consulta el estado de nuevo.'
          : row.status === 'failed'
            ? 'El envío no se ha realizado. Revisa la configuración y vuelve a intentarlo.'
            : row.status === 'unknown'
              ? 'No podemos confirmar el resultado. Comprueba el correo con tu proveedor antes de repetir el envío.'
              : 'Envío en curso. Consulta su estado antes de volver a enviarlo.',
  };
}
export async function reconcileMail(db: Pool, id: string) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const state = await lockEntities(c),
      before = state.rows[0].data;
    const row = (
      await c.query("SELECT * FROM crm_quote_mail WHERE id=$1 AND status='accepted' FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!row) {
      await c.query('COMMIT');
      return;
    }
    const deal = before.deals.find((d) => d.id === row.deal_id),
      revision = deal?.versions.find((v) => v.id === row.revision_id);
    if (deal && revision && !revision.sentAt) {
      let next: Data;
      if (
        ['Ganado', 'Perdido'].includes(deal.stage) ||
        deal.versions.slice(deal.versions.indexOf(revision) + 1).some((v) => v.sentAt)
      ) {
        next = structuredClone(before);
        next.deals
          .find((d) => d.id === deal.id)!
          .versions.find((v) => v.id === revision.id)!.sentAt = new Date(
          row.accepted_at,
        ).toISOString();
      } else {
        const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(
          new Date(),
        );
        next = markQuoteSent(
          before,
          deal.id,
          revision.id,
          new Date(row.accepted_at).toISOString(),
          row.due < today ? today : row.due,
          randomUUID,
        );
      }
      await recordSales(c, before, next, row.user_id);
      await writeEntities(c, before, next);
      await c.query('UPDATE crm_state_meta SET version=version+1 WHERE id=1');
    }
    await c.query("UPDATE crm_quote_mail SET status='sent' WHERE id=$1", [id]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function sendQuote(db: Pool, user: Identity, b: unknown, deps: SendDependencies) {
  validateSend(b);
  const requestHash = createHash('sha256')
    .update(JSON.stringify([b.dealId, b.revisionId, b.recipient, b.subject, b.body, b.due]))
    .digest('hex');
  let row: any, account: any, document: ReturnType<typeof authorized>;
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext($1))', [
      'quote-mail:' + b.revisionId,
    ]);
    const state = await readEntities(c);
    document = authorized(state.rows[0].data, user, b.dealId, b.revisionId);
    const existing = (await c.query('SELECT * FROM crm_quote_mail WHERE id=$1', [b.id])).rows[0];
    if (existing) {
      if (existing.user_id !== user.id || existing.request_hash !== requestHash)
        throw Error('Este intento corresponde a otro mensaje. Consulta el historial.');
      await c.query('COMMIT');
      return publicMail(existing);
    }
    // A crash before SMTP is safely retryable; a crash after transmission is ambiguous.
    await c.query(
      "UPDATE crm_quote_mail SET status=CASE WHEN status='preparing' THEN 'failed' ELSE 'unknown' END WHERE revision_id=$1 AND status IN ('preparing','sending') AND created_at<now()-interval '5 minutes'",
      [b.revisionId],
    );
    if (
      (
        await c.query(
          "SELECT id FROM crm_quote_mail WHERE revision_id=$1 AND status IN ('preparing','sending','accepted','unknown')",
          [b.revisionId],
        )
      ).rowCount
    )
      throw Error(
        'Existe un envío en curso o sin confirmar para esta revisión. Revisa su historial.',
      );
    if (
      !b.resend &&
      (
        await c.query("SELECT id FROM crm_quote_mail WHERE revision_id=$1 AND status='sent'", [
          b.revisionId,
        ])
      ).rowCount
    )
      throw Error('Esta revisión ya se ha enviado. Confirma el reenvío desde el historial.');
    account = (await c.query('SELECT * FROM crm_mail_accounts WHERE user_id=$1', [user.id]))
      .rows[0];
    if (!account?.verified_at)
      throw Error('Configura y comprueba tu correo en Mi cuenta antes de enviar.');
    if (['Ganado', 'Perdido'].includes(document.deal.stage))
      throw Error('El trato está cerrado. Reábrelo antes de enviar otro presupuesto.');
    markQuoteSent(
      state.rows[0].data,
      b.dealId,
      b.revisionId,
      new Date().toISOString(),
      b.due,
      randomUUID,
    );
    const filename =
      'Presupuesto-' +
      (document.revision.number || 'revision').replace(/[^a-zA-Z0-9_-]/g, '-') +
      '.pdf';
    row = (
      await c.query(
        `INSERT INTO crm_quote_mail(id,deal_id,revision_id,user_id,recipient,subject,body,sender,sender_name,account_version,due,request_hash,status,message_id,filename)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'preparing',$13,$14) RETURNING *`,
        [
          b.id,
          b.dealId,
          b.revisionId,
          user.id,
          b.recipient,
          b.subject.trim(),
          b.body,
          account.email,
          account.name,
          account.version,
          b.due,
          requestHash,
          '<' + b.id + '@' + account.email.split('@')[1] + '>',
          filename,
        ],
      )
    ).rows[0];
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  let submitted = false;
  try {
    const pdf = await deps.pdf(
      document!.deal,
      document!.revision,
      document!.company,
      document!.contact,
    );
    if (pdf.length > 10 * 1024 * 1024) throw Error('PDF demasiado grande');
    const freshUser = await deps.reauthorize();
    if (!freshUser || freshUser.id !== user.id || freshUser.workspaceId !== user.workspaceId)
      throw Error('Acceso cambiado');
    const latest = authorized(
      (await readEntities(db)).rows[0].data,
      freshUser,
      b.dealId,
      b.revisionId,
    );
    if (['Ganado', 'Perdido'].includes(latest.deal.stage)) throw Error('Trato cerrado');
    const valid = (
      await db.query(
        'SELECT version FROM crm_mail_accounts WHERE user_id=$1 AND version=$2 AND verified_at IS NOT NULL',
        [user.id, account.version],
      )
    ).rowCount;
    if (!valid) throw Error('Correo cambiado');
    const changed = await db.query(
      "UPDATE crm_quote_mail SET pdf=$1,status='sending' WHERE id=$2 AND status='preparing' RETURNING id",
      [pdf, b.id],
    );
    if (!changed.rowCount) throw Error('Intento caducado');
    submitted = true;
    await deps.deliver(account, {
      from: { name: row.sender_name, address: row.sender },
      to: row.recipient,
      subject: row.subject,
      text: row.body,
      messageId: row.message_id,
      attachments: [{ filename: row.filename, content: pdf, contentType: 'application/pdf' }],
    });
    await db.query("UPDATE crm_quote_mail SET status='accepted',accepted_at=now() WHERE id=$1", [
      b.id,
    ]);
  } catch (e) {
    // SMTP 4xx/5xx and explicit pre-transaction failures are safe failures, timeouts are not.
    const err = e as { code?: string; responseCode?: number; safeBeforeSend?: boolean };
    const known =
      !submitted ||
      err.safeBeforeSend ||
      ['EAUTH', 'EDNS', 'ETLS'].includes(err.code || '') ||
      (typeof err.responseCode === 'number' && err.responseCode >= 400);
    await db.query(
      "UPDATE crm_quote_mail SET status=$1,error=$2 WHERE id=$3 AND status IN ('preparing','sending')",
      [
        known ? 'failed' : 'unknown',
        known
          ? 'No se ha podido enviar. Revisa el correo y vuelve a intentarlo.'
          : 'Resultado no confirmado. No se reintentará automáticamente.',
        b.id,
      ],
    );
  }
  try {
    await reconcileMail(db, b.id);
  } catch {
    /* A later status request reconciles accepted messages without sending again. */
  }
  return publicMail((await db.query('SELECT * FROM crm_quote_mail WHERE id=$1', [b.id])).rows[0]);
}
