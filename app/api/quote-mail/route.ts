import { settingsOrDefault } from '../../../src/domain/business-settings';
import { canReadQuotes } from '../../../src/domain/permissions';
import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import {
  currentUser,
  sameOrigin,
  matchesWorkspace,
  json,
  throttle,
} from '../../../src/infrastructure/security/auth';
import { canAct } from '../../../src/domain/permissions';
import { visibleData } from '../../../src/application/access';
import { pool, initData, readState } from '../../../src/infrastructure/db';
import { sendQuote, publicMail, reconcileMail } from '../../../src/application/send-quote';
import { quotePdf } from '../../../src/presentation/documents/quote-pdf';
import { smtpTransport } from '../../../src/infrastructure/mail-settings';
import { decryptSecret } from '../../../src/infrastructure/security/totp';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!canReadQuotes(u)) return json({ error: 'Sin permiso para consultar presupuestos' }, 403);
    if (!canAct(u, 'deals')) return json({ error: 'Sin permiso' }, 403);
    const dealId = new URL(req.url).searchParams.get('deal');
    const data = visibleData((await readState()).rows[0].data, u);
    if (!data.deals.some((d) => d.id === dealId))
      return json({ error: 'Presupuesto no disponible' }, 404);
    const accepted = await pool.query(
      "SELECT id FROM crm_quote_mail WHERE deal_id=$1 AND status='accepted'",
      [dealId],
    );
    for (const row of accepted.rows) await reconcileMail(pool, row.id);
    await pool.query(
      "UPDATE crm_quote_mail SET status=CASE WHEN status='preparing' THEN 'failed' ELSE 'unknown' END WHERE deal_id=$1 AND status IN ('preparing','sending') AND created_at<now()-interval '5 minutes'",
      [dealId],
    );
    const entries = await pool.query(
      'SELECT * FROM crm_quote_mail WHERE deal_id=$1 ORDER BY created_at DESC LIMIT 30',
      [dealId],
    );
    return json({
      entries: entries.rows.map((row) => ({
        ...publicMail(row),
        revisionId: row.revision_id,
        canResolve: row.user_id === u.id || u.role === 'admin' || u.role === 'developer',
      })),
    });
  } catch {
    return json({ error: 'No se pudo consultar el historial de correo.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!canReadQuotes(u)) return json({ error: 'Sin permiso para consultar presupuestos' }, 403);
    if (
      !matchesWorkspace(req, u) ||
      !canAct(u, 'deals') ||
      (settingsOrDefault(u.workspace?.settings).modules.includes('Actividades') &&
        !canAct(u, 'tasks'))
    )
      return json({ error: 'Sin permiso' }, 403);
    const body = await readJsonObject(req, 20000);
    if (!(await throttle('quote-mail:' + u.id, 20, 3600)))
      return json({ error: 'Límite de envíos alcanzado. Espera una hora.' }, 429);
    await initData();
    if (body.action === 'resolve') {
      if (
        body.confirmed !== true ||
        !['sent', 'failed'].includes(body.outcome) ||
        typeof body.id !== 'string'
      )
        return json({ error: 'Confirma el resultado consultado con tu proveedor.' }, 400);
      const row = (
        await pool.query("SELECT * FROM crm_quote_mail WHERE id=$1 AND status='unknown'", [body.id])
      ).rows[0];
      const data = visibleData((await readState()).rows[0].data, u);
      if (
        !row ||
        !data.deals.some((d) => d.id === row.deal_id) ||
        !(row.user_id === u.id || u.role === 'admin' || u.role === 'developer')
      )
        return json({ error: 'Envío no disponible para resolver.' }, 403);
      await pool.query(
        "UPDATE crm_quote_mail SET status=$1,accepted_at=CASE WHEN $1='accepted' THEN now() ELSE NULL END,error=$2 WHERE id=$3 AND status='unknown'",
        [
          body.outcome === 'sent' ? 'accepted' : 'failed',
          'Resultado confirmado manualmente por ' + u.username + ': ' + body.outcome,
          body.id,
        ],
      );
      await reconcileMail(pool, body.id);
      return json({ ok: true });
    }
    const result = await sendQuote(pool, u, body, {
      pdf: quotePdf,
      reauthorize: () => currentUser(),
      deliver: async (account, mail) => {
        let transport;
        try {
          transport = await smtpTransport(account, decryptSecret(account.secret));
        } catch {
          throw { safeBeforeSend: true };
        }
        try {
          const result = await transport.sendMail(mail);
          if (!result.accepted?.length) throw { responseCode: 550 };
        } finally {
          transport.close();
        }
      },
    });
    return json(result);
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    const message = (e as Error).message || '';
    const safe = [
      'Solicitud de envío no válida.',
      'Introduce un único destinatario válido.',
      'Revisa el asunto y el mensaje.',
      'Indica el próximo seguimiento.',
      'Sin permiso para enviar presupuestos.',
      'Presupuesto no disponible.',
      'Este intento corresponde a otro mensaje. Consulta el historial.',
      'Existe un envío en curso o sin confirmar para esta revisión. Revisa su historial.',
      'Esta revisión ya se ha enviado. Confirma el reenvío desde el historial.',
      'Configura y comprueba tu correo en Mi cuenta antes de enviar.',
      'El trato está cerrado. Reábrelo antes de enviar otro presupuesto.',
      'Indica una fecha de seguimiento válida',
    ];
    return json(
      {
        error: safe.includes(message)
          ? message
          : 'No se ha podido completar la solicitud. Consulta el historial antes de repetir el envío.',
      },
      400,
    );
  }
}
