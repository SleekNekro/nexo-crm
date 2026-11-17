import { randomUUID } from 'node:crypto';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
  throttle,
} from '../../../src/infrastructure/security/auth';
import { pool, initData } from '../../../src/infrastructure/db';
import { encryptSecret, decryptSecret } from '../../../src/infrastructure/security/totp';
import { verifyMailbox } from '../../../src/infrastructure/mail-settings';
import { connection, mailbox } from '../../../src/domain/mail-settings';
import { canAct } from '../../../src/domain/permissions';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!canAct(u, 'deals')) return json({ error: 'Sin permiso para gestionar presupuestos' }, 403);
    await initData();
    const [providers, accounts, defaults, reminders] = await Promise.all([
      pool.query('SELECT * FROM crm_mail_providers ORDER BY name'),
      pool.query(
        'SELECT provider_id,email,name,username,signature,host,port,security,version,verified_at,reminders_enabled FROM crm_mail_accounts WHERE user_id=$1',
        [u.id],
      ),
      pool.query('SELECT provider_id FROM crm_mail_preferences WHERE id=true'),
      pool.query(
        'SELECT subject,due,status,sent_at,error FROM crm_activity_reminders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',
        [u.id],
      ),
    ]);
    return json({
      providers: providers.rows,
      reminders: reminders.rows,
      account: accounts.rows[0] || null,
      defaultProvider: defaults.rows[0]?.provider_id || 'manual',
      canManage: !!u.platformDeveloper,
    });
  } catch {
    return json({ error: 'No se pudo cargar el correo.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser();
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    if (!matchesWorkspace(req, u) || !canAct(u, 'deals'))
      return json({ error: 'Sin permiso' }, 403);
    if (Number(req.headers.get('content-length')) > 16000)
      return json({ error: 'Solicitud demasiado grande' }, 413);
    const raw = await req.text();
    if (raw.length > 16000) return json({ error: 'Solicitud demasiado grande' }, 413);
    const b = JSON.parse(raw);
    await initData();
    if (b.action === 'provider' || b.action === 'default') {
      if (!u.platformDeveloper)
        return json({ error: 'Solo el desarrollador puede gestionar plantillas.' }, 403);
      if (b.action === 'provider') {
        const c = connection(b);
        if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100)
          return json({ error: 'Indica un nombre de plantilla.' }, 400);
        // Templates are immutable: a new destination never receives an existing credential.
        const id = randomUUID();
        await pool.query('INSERT INTO crm_mail_providers VALUES($1,$2,$3,$4,$5)', [
          id,
          b.name.trim(),
          c.host,
          c.port,
          c.security,
        ]);
        return json({ ok: true, id });
      }
      if (
        b.providerId !== 'manual' &&
        !(await pool.query('SELECT id FROM crm_mail_providers WHERE id=$1', [b.providerId]))
          .rowCount
      )
        return json({ error: 'Proveedor no válido' }, 400);
      await pool.query(
        'INSERT INTO crm_mail_preferences(id,provider_id) VALUES(true,$1) ON CONFLICT(id) DO UPDATE SET provider_id=excluded.provider_id',
        [b.providerId],
      );
      return json({ ok: true });
    }
    if (!Number.isInteger(b.version) || b.version < 0)
      return json({ error: 'Recarga la configuración.' }, 400);
    if (b.action === 'verify') {
      if (!(await throttle('smtp:' + u.id, 5, 900)))
        return json({ error: 'Demasiadas comprobaciones. Espera 15 minutos.' }, 429);
      const row = (
        await pool.query('SELECT * FROM crm_mail_accounts WHERE user_id=$1 AND version=$2', [
          u.id,
          b.version,
        ])
      ).rows[0];
      if (!row) return json({ error: 'La configuración ha cambiado. Vuelve a abrir Correo.' }, 409);
      try {
        await verifyMailbox(row, decryptSecret(row.secret));
      } catch {
        await pool.query(
          'UPDATE crm_mail_accounts SET verified_at=NULL WHERE user_id=$1 AND version=$2',
          [u.id, b.version],
        );
        return json(
          {
            error:
              'No se pudo conectar. Revisa el correo, la contraseña del buzón y los datos del proveedor.',
          },
          400,
        );
      }
      const updated = await pool.query(
        'UPDATE crm_mail_accounts SET verified_at=now() WHERE user_id=$1 AND version=$2 RETURNING user_id',
        [u.id, b.version],
      );
      if (!updated.rowCount)
        return json(
          { error: 'La configuración cambió durante la comprobación. Compruébala de nuevo.' },
          409,
        );
      return json({ ok: true });
    }
    if (!['save', 'disconnect', 'reminders'].includes(b.action))
      return json({ error: 'Acción no válida' }, 400);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext(current_schema()),hashtext($1))', [
        'mail:' + u.id,
      ]);
      const old = (await db.query('SELECT * FROM crm_mail_accounts WHERE user_id=$1', [u.id]))
        .rows[0];
      if ((old?.version || 0) !== b.version) {
        await db.query('ROLLBACK');
        return json({ error: 'La configuración ha cambiado. Vuelve a abrir Correo.' }, 409);
      }
      if (b.action === 'reminders') {
        if (typeof b.enabled !== 'boolean' || !old) throw Error('Configuración no válida');
        await db.query(
          "UPDATE crm_mail_accounts SET reminders_enabled=$1,version=nextval('crm_mail_version') WHERE user_id=$2",
          [b.enabled, u.id],
        );
      } else if (b.action === 'disconnect') {
        await db.query('DELETE FROM crm_mail_accounts WHERE user_id=$1', [u.id]);
      } else {
        const account = mailbox(b);
        const provider =
          b.providerId === 'manual'
            ? b
            : (await db.query('SELECT * FROM crm_mail_providers WHERE id=$1', [b.providerId]))
                .rows[0];
        if (!provider) throw Error('Selecciona un proveedor.');
        const c = connection(provider);
        const sameLogin =
          old &&
          old.host === c.host &&
          old.port === c.port &&
          old.security === c.security &&
          old.username === account.username &&
          old.email === account.email;
        if (!b.password && !sameLogin)
          throw Error('Introduce la contraseña para este correo y proveedor.');
        const secret = b.password ? encryptSecret(b.password) : old.secret;
        await db.query(
          `INSERT INTO crm_mail_accounts(user_id,provider_id,email,name,username,signature,host,port,security,secret,version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,nextval('crm_mail_version'))
          ON CONFLICT(user_id) DO UPDATE SET provider_id=excluded.provider_id,email=excluded.email,name=excluded.name,username=excluded.username,signature=excluded.signature,host=excluded.host,port=excluded.port,security=excluded.security,secret=excluded.secret,version=excluded.version,verified_at=NULL,updated_at=now()`,
          [
            u.id,
            b.providerId,
            account.email,
            account.name,
            account.username,
            account.signature,
            c.host,
            c.port,
            c.security,
            secret,
          ],
        );
      }
      await db.query('COMMIT');
      return json({ ok: true });
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  } catch (e) {
    const safe = [
      'Indica el nombre del servidor SMTP, sin https:// ni rutas.',
      'Usa SSL/TLS (465) o STARTTLS (587).',
      'Introduce un correo válido.',
      'Revisa el nombre, usuario o firma.',
      'Contraseña no válida.',
      'Selecciona un proveedor.',
      'Introduce la contraseña para este correo y proveedor.',
    ];
    return json(
      {
        error: safe.includes((e as Error).message)
          ? (e as Error).message
          : 'No se pudo guardar la configuración.',
      },
      400,
    );
  }
}
