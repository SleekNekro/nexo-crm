import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { sendQuote, quoteMailSchema } from '../src/application/send-quote.ts';
import { readEntities, lockEntities, writeEntities } from '../src/infrastructure/entity-store.ts';
import { issueQuote } from '../src/domain/actions.ts';
assert.ok(
  process.env.DATABASE_URL?.endsWith('/crm_auth_check'),
  'Only disposable database allowed',
);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await db.query(quoteMailSchema);
const user = {
  id: 'mail.dev',
  username: 'mail.dev',
  role: 'developer',
  profile: 'mail.dev',
  mustChange: false,
  workspaceId: 'nexo',
};
let deliveries = 0,
  lastMail;
const deps = {
  pdf: async () => Buffer.from('%PDF-1.7 mock for delivery test'),
  reauthorize: async () => user,
  deliver: async (account, mail) => {
    deliveries++;
    lastMail = mail;
  },
};
const now = new Date().toISOString(),
  due = '2099-01-01';
async function revision() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const before = (await lockEntities(c)).rows[0].data;
    const deal = before.deals.find(
      (d) => !['Ganado', 'Perdido'].includes(d.stage) && d.lines.length,
    );
    assert.ok(deal);
    const id = randomUUID(),
      next = issueQuote(before, deal.id, id, now);
    await writeEntities(c, before, next);
    await c.query('COMMIT');
    return { dealId: deal.id, revisionId: id };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
const request = async () => ({
  id: randomUUID(),
  ...(await revision()),
  recipient: 'recipient@example.com',
  subject: 'Presupuesto de prueba',
  body: 'PDF adjunto',
  due,
});
const first = await request();
await assert.rejects(() => sendQuote(db, user, first, deps), /comprueba tu correo/);
await db.query("UPDATE crm_mail_accounts SET verified_at=now() WHERE user_id='mail.dev'");
let result = await sendQuote(db, user, first, deps);
assert.equal(result.status, 'sent');
assert.equal(deliveries, 1);
assert.equal(lastMail.attachments.length, 1);
assert.equal(lastMail.attachments[0].content.toString().slice(0, 5), '%PDF-');
assert.equal(lastMail.from.address, 'test@example.com');
let state = (await readEntities(db)).rows[0].data;
assert.equal(state.deals.find((d) => d.id === first.dealId).stage, 'Pendiente del cliente');
assert.equal(state.tasks.filter((t) => t.quoteRevisionId === first.revisionId).length, 1);
result = await sendQuote(db, user, first, deps);
assert.equal(result.status, 'sent');
assert.equal(deliveries, 1);
await assert.rejects(
  () => sendQuote(db, user, { ...first, subject: 'Changed' }, deps),
  /otro mensaje/,
);
await assert.rejects(
  () => sendQuote(db, user, { ...first, id: randomUUID() }, deps),
  /ya se ha enviado/,
);
await sendQuote(db, user, { ...first, id: randomUUID(), resend: true }, deps);
assert.equal(deliveries, 2);
state = (await readEntities(db)).rows[0].data;
assert.equal(state.tasks.filter((t) => t.quoteRevisionId === first.revisionId).length, 1);
const fail = await request();
result = await sendQuote(db, user, fail, {
  ...deps,
  deliver: async () => {
    throw { responseCode: 550 };
  },
});
assert.equal(result.status, 'failed');
state = (await readEntities(db)).rows[0].data;
assert.equal(
  state.deals.find((d) => d.id === fail.dealId).versions.find((v) => v.id === fail.revisionId)
    .sentAt,
  undefined,
);
const ambiguous = await request();
result = await sendQuote(db, user, ambiguous, {
  ...deps,
  deliver: async () => {
    throw { code: 'ETIMEDOUT' };
  },
});
assert.equal(result.status, 'unknown');
await assert.rejects(
  () => sendQuote(db, user, { ...ambiguous, id: randomUUID() }, deps),
  /sin confirmar/,
);
const denied = await request();
result = await sendQuote(db, user, denied, { ...deps, reauthorize: async () => null });
assert.equal(result.status, 'failed');
assert.equal(deliveries, 2);
const parallel = await request();
let release, started;
const gate = new Promise((r) => {
    release = r;
  }),
  ready = new Promise((r) => {
    started = r;
  });
const running = sendQuote(db, user, parallel, {
  ...deps,
  deliver: async () => {
    started();
    await gate;
    deliveries++;
  },
});
await ready;
assert.equal((await sendQuote(db, user, parallel, deps)).status, 'sending');
await assert.rejects(
  () => sendQuote(db, user, { ...parallel, id: randomUUID() }, deps),
  /en curso/,
);
release();
assert.equal((await running).status, 'sent');
assert.equal(deliveries, 3);
await db.end();
console.log(
  'ENVÍOS OK: PDF adjunto, seguimiento único, idempotencia, reenvío explícito, rechazo SMTP, tiempo agotado, permisos revocados y concurrencia. Ningún correo real enviado.',
);
