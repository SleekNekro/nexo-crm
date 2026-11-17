import assert from 'node:assert/strict';
import pg from 'pg';
import { runActivityReminders, reminderSchema } from '../src/application/activity-reminders.ts';
import { readEntities, lockEntities, writeEntities } from '../src/infrastructure/entity-store.ts';
assert.ok(process.env.DATABASE_URL?.endsWith('/crm_auth_check'));
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await db.query(reminderSchema);
const now = new Date('2026-11-17T09:00:00Z');
async function mutate(fn) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const before = (await lockEntities(c)).rows[0].data,
      next = structuredClone(before);
    fn(next);
    await writeEntities(c, before, next);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
await mutate((d) => {
  for (const [id, extra] of [
    ['reminder-pending', {}],
    ['reminder-done', { done: true }],
    ['reminder-cancelled', { cancelled: 'Cancelada' }],
    ['reminder-later', { due: '2026-11-19' }],
  ])
    d.tasks.push({
      id,
      dealId: 'd1',
      title: id,
      owner: 'mail.dev',
      kind: 'Llamada',
      due: '2026-11-18',
      done: false,
      ...extra,
    });
});
const account = (await db.query("SELECT * FROM crm_mail_accounts WHERE user_id='mail.dev'"))
  .rows[0];
const user = {
  ...account,
  id: 'mail.dev',
  username: 'mail.dev',
  profile: 'mail.dev',
  role: 'developer',
  permissions: null,
  active: true,
  mustChange: false,
  workspaceId: 'nexo',
  reminders_enabled: true,
  verified_at: now,
};
let sent = [];
const deliver = async (u, mail) => {
  sent.push(mail);
};
const a = await Promise.all([
  runActivityReminders(db, [user], 'http://localhost:8080', deliver, now),
  runActivityReminders(db, [user], 'http://localhost:8080', deliver, now),
]);
assert.equal(sent.length, 1);
assert.match(sent[0].subject, /^\[Recordatorio\]/);
assert.equal(sent[0].to, user.email);
assert.match(sent[0].text, /deal=d1/);
await runActivityReminders(db, [user], 'http://localhost:8080', deliver, now);
assert.equal(sent.length, 1);
await mutate((d) =>
  d.tasks.push({
    id: 'reminder-disabled',
    dealId: 'd1',
    title: 'No enviar',
    owner: 'mail.dev',
    kind: 'Llamada',
    due: '2026-11-18',
    done: false,
  }),
);
await runActivityReminders(
  db,
  [{ ...user, reminders_enabled: false }],
  'http://localhost:8080',
  deliver,
  now,
);
assert.equal(sent.length, 1);
await db.query("UPDATE public.app_users SET active=false WHERE id='mail.dev'");
const disabled = await runActivityReminders(db, [user], 'http://localhost:8080', deliver, now);
assert.equal(disabled.skipped, 1);
assert.equal(sent.length, 1);
await db.query("UPDATE public.app_users SET active=true WHERE id='mail.dev'");
await mutate((d) =>
  d.tasks.push({
    id: 'reminder-timeout',
    dealId: 'd1',
    title: 'Incierto',
    owner: 'mail.dev',
    kind: 'Llamada',
    due: '2026-11-18',
    done: false,
  }),
);
const unknown = await runActivityReminders(
  db,
  [user],
  'http://localhost:8080',
  async () => {
    throw { code: 'ETIMEDOUT' };
  },
  now,
);
assert.equal(unknown.unknown, 1);
await runActivityReminders(db, [user], 'http://localhost:8080', deliver, now);
assert.equal(sent.length, 1);
await db.end();
console.log(
  'RECORDATORIOS OK: responsable correcto, envío único concurrente, completadas/canceladas excluidas, preferencia personal, cuenta desactivada y desconexión sin reenvío. Sin mensajes reales.',
);
