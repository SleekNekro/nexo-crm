import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
import { pool, readState, initData } from '../../../src/infrastructure/db';
import { lockEntities } from '../../../src/infrastructure/entity-store';
import { visibleData } from '../../../src/application/access';
import { canAct, canView, canReadQuotes } from '../../../src/domain/permissions';
export async function GET(req: Request) {
  try {
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!canView(u, 'Empresas') || !matchesWorkspace(req, u))
      return json({ error: 'Sin permiso' }, 403);
    const p = new URL(req.url).searchParams,
      id = p.get('company'),
      offset = Number(p.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      return json({ error: 'Página no válida' }, 400);
    const data = visibleData((await readState()).rows[0].data, u);
    if (!data.companies.some((c) => c.id === id))
      return json({ error: 'Empresa no disponible' }, 404);
    const deals = data.deals.filter((d) => d.companyId === id),
      ids = deals.map((d) => d.id),
      tasks = data.tasks.filter((t) => ids.includes(t.dealId) && t.done && !t.cancelled);
    const [notes, mails, completed] = await Promise.all([
      pool.query('SELECT * FROM crm_company_notes WHERE company_id=$1', [id]),
      pool.query(
        "SELECT id,deal_id,subject,body,sender,recipient,accepted_at,error FROM crm_quote_mail WHERE deal_id=ANY($1::text[]) AND status IN ('accepted','sent')",
        [canReadQuotes(u) ? ids : []],
      ),
      pool.query(
        "SELECT entity_id,max(at) AS at FROM sales_events WHERE kind='activity_completed' AND entity_id=ANY($1::text[]) GROUP BY entity_id",
        [tasks.map((t) => t.id)],
      ),
    ]);
    const dates = new Map(completed.rows.map((x) => [x.entity_id, x.at.toISOString()]));
    const entries = [
      ...notes.rows.map((n) => ({
        id: 'company:' + n.id,
        kind: n.kind,
        title: n.kind === 'Nota' ? 'Nota de empresa' : n.kind + ' registrada',
        text: n.text,
        author: n.actor_name,
        date: n.created_at.toISOString(),
      })),
      ...data.notes
        .filter((n) => ids.includes(n.dealId))
        .map((n) => ({
          id: 'deal:' + n.id,
          kind: 'Nota',
          title: 'Nota del trato',
          text: n.text,
          author: n.owner,
          date: n.date,
          dealId: n.dealId,
        })),
      ...tasks.map((t) => ({
        id: 'task:' + t.id,
        kind: 'Actividad',
        title: t.title,
        text: t.result || '',
        author: t.owner,
        date: dates.get(t.id) || t.due + 'T12:00:00',
        plannedDate: !dates.has(t.id),
        dealId: t.dealId,
      })),
      ...(canReadQuotes(u)
        ? deals.flatMap((d) =>
            d.versions.map((v, i) => ({
              id: 'quote:' + v.id,
              kind: 'Presupuesto',
              title: `Presupuesto ${v.number || 'R' + (i + 1)}`,
              dateOnly: true,
              text: 'Revisión emitida',
              author: d.owner,
              date: v.date,
              dealId: d.id,
            })),
          )
        : []),
      ...mails.rows.map((m) => ({
        id: 'mail:' + m.id,
        kind: 'Correo enviado',
        title: m.subject,
        text: m.body,
        author: m.sender,
        date: m.accepted_at.toISOString(),
        dealId: m.deal_id,
        recipient: m.recipient,
      })),
    ].sort(
      (a, b) =>
        ('plannedDate' in b && b.plannedDate ? 0 : Date.parse(b.date)) -
          ('plannedDate' in a && a.plannedDate ? 0 : Date.parse(a.date)) ||
        a.id.localeCompare(b.id),
    );
    return json({
      entries: entries.slice(offset, offset + 15).map((e) => ({
        ...e,
        dealTitle: 'dealId' in e ? deals.find((d) => d.id === e.dealId)?.title : undefined,
      })),
      total: entries.length,
      more: offset + 15 < entries.length,
    });
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    return json({ error: 'No se pudo cargar el historial.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!matchesWorkspace(req, u) || !canView(u, 'Empresas') || !canAct(u, 'companies'))
      return json({ error: 'Sin permiso para añadir notas de empresa' }, 403);
    const b = await readJsonObject(req, 24000);
    if (
      !b ||
      typeof b.id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(b.id) ||
      typeof b.companyId !== 'string' ||
      !['Nota', 'Llamada', 'Reunión', 'Correo'].includes(b.kind) ||
      typeof b.text !== 'string' ||
      !b.text.trim() ||
      b.text.trim().length > 4000
    )
      return json({ error: 'Escribe una nota de hasta 4000 caracteres.' }, 400);
    await initData();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const state = await lockEntities(c),
        data = visibleData(state.rows[0].data, u);
      if (!data.companies.some((x) => x.id === b.companyId)) {
        await c.query('ROLLBACK');
        return json({ error: 'Empresa no disponible' }, 404);
      }
      const old = (await c.query('SELECT * FROM crm_company_notes WHERE id=$1', [b.id])).rows[0];
      if (
        old &&
        (old.company_id !== b.companyId ||
          old.actor_id !== u.id ||
          old.text !== b.text.trim() ||
          old.kind !== b.kind)
      ) {
        await c.query('ROLLBACK');
        return json({ error: 'La nota corresponde a otra operación.' }, 409);
      }
      if (!old) {
        await c.query(
          'INSERT INTO crm_company_notes(id,company_id,kind,text,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6)',
          [b.id, b.companyId, b.kind, b.text.trim(), u.id, u.displayName || u.username],
        );
        await c.query('UPDATE crm_state_meta SET version=version+1 WHERE id=1');
      }
      await c.query('COMMIT');
      return json({ ok: true });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    return json({ error: 'No se ha podido guardar la nota. Puedes volver a intentarlo.' }, 503);
  }
}
