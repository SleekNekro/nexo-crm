import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Identity } from './access';
import { visibleData } from './access.ts';
import { canView } from '../domain/permissions.ts';
import { needsReminder, reminderMessage } from '../domain/activity-reminders.ts';
import { readEntities } from '../infrastructure/entity-store.ts';
export const reminderSchema = `CREATE TABLE IF NOT EXISTS crm_activity_reminders(
 id text PRIMARY KEY,task_id text NOT NULL,user_id text NOT NULL,due text NOT NULL,recipient text NOT NULL,subject text NOT NULL,
 status text NOT NULL CHECK(status IN ('sending','sent','failed','unknown','skipped')),created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,error text,
 UNIQUE(task_id,user_id,due));`;
export type ReminderRecipient = Identity & {
  email: string;
  name: string;
  username: string;
  host: string;
  port: number;
  security: 'tls' | 'starttls';
  secret: string;
  version: number;
  verified_at: unknown;
  reminders_enabled: boolean;
  active: boolean;
};
export async function runActivityReminders(
  db: Pool,
  recipients: ReminderRecipient[],
  publicUrl: string,
  deliver: (account: ReminderRecipient, mail: any) => Promise<void>,
  now = new Date(),
  limit = 10,
) {
  const data = (await readEntities(db)).rows[0].data;
  const tally = { sent: 0, failed: 0, unknown: 0, skipped: 0 };
  let count = 0;
  await db.query(
    "UPDATE crm_activity_reminders SET status='unknown',error='Resultado no confirmado tras una interrupción; no se reenviará automáticamente.' WHERE status='sending' AND created_at<now()-interval '5 minutes'",
  );
  for (const task of data.tasks.filter((t) => needsReminder(t, now))) {
    if (count >= limit) break;
    const matches = recipients.filter(
      (u) => (['admin', 'developer'].includes(u.role) ? u.username : u.profile) === task.owner,
    );
    if (matches.length !== 1) continue;
    const u = matches[0];
    if (
      !u.active ||
      u.mustChange ||
      (u.accessUntil && Date.parse(u.accessUntil) <= now.getTime()) ||
      !u.reminders_enabled ||
      !u.verified_at ||
      !canView(u, 'Actividades')
    )
      continue;
    if (!visibleData(data, u).tasks.some((t) => t.id === task.id)) continue;
    const deal = data.deals.find((d) => d.id === task.dealId);
    if (!deal) continue;
    const company = data.companies.find((c) => c.id === deal.companyId);
    const content = reminderMessage(task, deal.title, company?.name || '', publicUrl),
      id = randomUUID();
    const claim = await db.query(
      "INSERT INTO crm_activity_reminders(id,task_id,user_id,due,recipient,subject,status) VALUES($1,$2,$3,$4,$5,$6,'sending') ON CONFLICT(task_id,user_id,due) DO NOTHING RETURNING id",
      [id, task.id, u.id, task.due, u.email, content.subject],
    );
    if (!claim.rowCount) continue;
    count++;
    // Recheck mutable activity and account immediately before sending.
    const latest = (await readEntities(db)).rows[0].data,
      current = latest.tasks.find((t) => t.id === task.id);
    const stillActive = (
      await db.query(
        `SELECT a.user_id FROM crm_mail_accounts a JOIN public.app_users u ON u.id=a.user_id JOIN public.crm_memberships m ON m.user_id=u.id AND m.workspace_id=$3 WHERE a.user_id=$1 AND a.version=$2 AND a.verified_at IS NOT NULL AND a.reminders_enabled AND u.active AND NOT u.must_change AND m.active AND (m.access_until IS NULL OR m.access_until>now()) AND m.role=$4 AND m.profile=$5 AND m.permissions IS NOT DISTINCT FROM $6::jsonb`,
        [
          u.id,
          u.version,
          u.workspaceId,
          u.role,
          u.profile,
          u.permissions ? JSON.stringify(u.permissions) : null,
        ],
      )
    ).rowCount;
    if (
      !current ||
      !needsReminder(current, now) ||
      current.owner !== task.owner ||
      !stillActive ||
      !visibleData(latest, u).tasks.some((t) => t.id === task.id)
    ) {
      await db.query(
        "UPDATE crm_activity_reminders SET status='skipped',error='Actividad o acceso modificados antes del envío.' WHERE id=$1",
        [id],
      );
      tally.skipped++;
      continue;
    }
    try {
      await deliver(u, {
        from: { name: u.name, address: u.email },
        to: u.email,
        ...reminderMessage(
          current,
          latest.deals.find((d) => d.id === current.dealId)?.title || deal.title,
          company?.name || '',
          publicUrl,
        ),
        messageId: '<reminder-' + id + '@' + u.email.split('@')[1] + '>',
      });
      await db.query("UPDATE crm_activity_reminders SET status='sent',sent_at=now() WHERE id=$1", [
        id,
      ]);
      tally.sent++;
    } catch (e) {
      const error = e as { safeBeforeSend?: boolean; code?: string; responseCode?: number };
      const failed =
        error.safeBeforeSend ||
        ['EAUTH', 'EDNS', 'ETLS'].includes(error.code || '') ||
        (typeof error.responseCode === 'number' && error.responseCode >= 400);
      await db.query('UPDATE crm_activity_reminders SET status=$1,error=$2 WHERE id=$3', [
        failed ? 'failed' : 'unknown',
        failed
          ? 'No se pudo enviar. Revisa la conexión del correo.'
          : 'No se puede confirmar el resultado; no se reenviará automáticamente.',
        id,
      ]);
      if (failed) tally.failed++;
      else tally.unknown++;
    }
  }
  return tally;
}
