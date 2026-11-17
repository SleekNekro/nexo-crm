import { validInternalToken } from '../../../../src/infrastructure/security/request-input';
import { initAuth, json } from '../../../../src/infrastructure/security/auth';
import { systemPool } from '../../../../src/infrastructure/system-db';
import { initWorkspaceData } from '../../../../src/infrastructure/db';
import { poolForWorkspace } from '../../../../src/infrastructure/workspace-store';
import {
  runActivityReminders,
  type ReminderRecipient,
} from '../../../../src/application/activity-reminders';
import { reminderWindow } from '../../../../src/domain/activity-reminders';
import { smtpTransport } from '../../../../src/infrastructure/mail-settings';
import { decryptSecret } from '../../../../src/infrastructure/security/totp';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const secret = process.env.CRM_REMINDER_TOKEN,
    provided = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (!validInternalToken(provided, secret)) return json({ error: 'No disponible' }, 404);
  if (!reminderWindow().ready) return json({ status: 'before-window' });
  await initAuth();
  const lock = await systemPool.connect();
  try {
    const got = (
      await lock.query("SELECT pg_try_advisory_lock(hashtext('nexo-activity-reminders')) AS locked")
    ).rows[0].locked;
    if (!got) return json({ status: 'running' });
    try {
      const workspaces = await systemPool.query(
        'SELECT id,schema_name FROM crm_workspaces WHERE ready',
      );
      const results = [];
      for (const w of workspaces.rows) {
        await initWorkspaceData(w);
        const db = poolForWorkspace(w);
        const rows = await db.query(
          `SELECT a.*,u.username AS account_username,u.active,u.must_change,m.role,m.profile,m.permissions,m.active AS member_active,m.external,m.access_until FROM crm_mail_accounts a JOIN public.app_users u ON u.id=a.user_id JOIN public.crm_memberships m ON m.user_id=u.id AND m.workspace_id=$1`,
          [w.id],
        );
        const recipients: ReminderRecipient[] = rows.rows.map((r) => ({
          ...r,
          id: r.user_id,
          username: r.account_username,
          active: r.active && r.member_active,
          mustChange: r.must_change,
          workspaceId: w.id,
          accessUntil: r.access_until?.toISOString() || null,
        }));
        // SMTP authentication may differ from the account's CRM username.
        const byId = new Map(rows.rows.map((r) => [r.user_id, r]));
        results.push(
          await runActivityReminders(
            db,
            recipients,
            process.env.CRM_PUBLIC_URL || 'http://localhost:8180',
            async (u, mail) => {
              let transport;
              try {
                const config = byId.get(u.id)!;
                transport = await smtpTransport(config, decryptSecret(config.secret));
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
          ),
        );
      }
      return json({ status: 'ok', results });
    } finally {
      await lock.query("SELECT pg_advisory_unlock(hashtext('nexo-activity-reminders'))");
    }
  } catch {
    return json({ error: 'No se pudo completar la revisión de recordatorios.' }, 503);
  } finally {
    lock.release();
  }
}
