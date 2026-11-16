import { systemPool as pool } from '../../../src/infrastructure/system-db';
import {
  currentUser,
  json,
  newSession,
  sameOrigin,
  throttle,
} from '../../../src/infrastructure/security/auth';
import { checkPassword } from '../../../src/infrastructure/security/password';
import { consumeFactor } from '../../../src/infrastructure/security/second-factor';
import {
  decryptSecret,
  encryptSecret,
  newSecret,
  recoveryCodes,
  validStep,
} from '../../../src/infrastructure/security/totp';
export async function GET() {
  try {
    const u = await currentUser(true, true);
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    const r = await pool.query(
      'SELECT totp_secret IS NOT NULL AS enabled,jsonb_array_length(recovery_hashes) AS remaining FROM app_users WHERE id=$1',
      [u.id],
    );
    const sessions = await pool.query(
      "SELECT count(*) FROM app_sessions WHERE user_id=$1 AND expires_at>now() AND last_seen>now()-interval '120 minutes'",
      [u.id],
    );
    return json({ ...r.rows[0], sessions: Number(sessions.rows[0].count) });
  } catch {
    return json({ error: 'No se puede consultar la seguridad' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser(true, true);
    if (!u || u.mustChange) return json({ error: 'Inicia sesión' }, 401);
    const b = await req.json();
    if (!(await throttle('security:' + u.id)))
      return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
    const r = await pool.query('SELECT * FROM app_users WHERE id=$1', [u.id]),
      row = r.rows[0];
    if (
      typeof b.password !== 'string' ||
      b.password.length > 128 ||
      !(await checkPassword(b.password, row.password_hash))
    )
      return json({ error: 'Contraseña incorrecta' }, 400);
    if (b.action === 'setup') {
      if (row.totp_secret) return json({ error: 'La verificación ya está activada' }, 409);
      const secret = newSecret();
      await pool.query(
        'UPDATE app_users SET totp_pending=$1,totp_pending_at=now() WHERE id=$2 AND password_hash=$3 AND active=true',
        [encryptSecret(secret), u.id, row.password_hash],
      );
      return json({
        secret,
        uri:
          'otpauth://totp/NEXO:' +
          encodeURIComponent(u.username) +
          '?secret=' +
          secret +
          '&issuer=NEXO&algorithm=SHA1&digits=6&period=30',
      });
    }
    if (b.action === 'enable') {
      if (
        row.totp_secret ||
        !row.totp_pending ||
        Date.now() - new Date(row.totp_pending_at).getTime() > 600000
      )
        return json({ error: 'La configuración ha caducado. Iníciala de nuevo.' }, 400);
      const step = validStep(decryptSecret(row.totp_pending), b.code);
      if (step === null)
        return json({ error: 'Código incorrecto. Revisa la hora del móvil.' }, 400);
      const recovery = recoveryCodes();
      const updated = await pool.query(
        'UPDATE app_users SET totp_secret=totp_pending,totp_pending=NULL,totp_pending_at=NULL,totp_last_step=$1,recovery_hashes=$2 WHERE id=$3 AND totp_secret IS NULL AND totp_pending=$4 AND password_hash=$5 AND active=true RETURNING id',
        [step, JSON.stringify(recovery.hashes), u.id, row.totp_pending, row.password_hash],
      );
      if (!updated.rowCount)
        return json({ error: 'La cuenta ha cambiado. Vuelve a iniciar sesión.' }, 409);
      await pool.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
      await newSession(u.id, row.password_hash, row.totp_pending);
      await pool.query('DELETE FROM auth_attempts WHERE username=$1', ['security:' + u.id]);
      return json({ codes: recovery.codes });
    }
    if (b.action === 'disable') {
      if (!(await consumeFactor(u.id, b.code, row.password_hash)))
        return json({ error: 'Código incorrecto o ya utilizado' }, 400);
      await pool.query(
        "UPDATE app_users SET totp_secret=NULL,totp_pending=NULL,totp_pending_at=NULL,totp_last_step=-1,recovery_hashes='[]' WHERE id=$1 AND password_hash=$2",
        [u.id, row.password_hash],
      );
      await pool.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
      await newSession(u.id, row.password_hash);
      await pool.query('DELETE FROM auth_attempts WHERE username=$1', ['security:' + u.id]);
      return json({ ok: true });
    }
    return json({ error: 'Acción no válida' }, 400);
  } catch {
    return json({ error: 'No se ha podido actualizar la seguridad' }, 503);
  }
}
