import { securityEvent } from '../../../src/infrastructure/security/audit';
import {
  readJsonObject,
  RequestInputError,
} from '../../../src/infrastructure/security/request-input';
import { preview } from '../../../src/infrastructure/db';
import { systemPool as pool } from '../../../src/infrastructure/system-db';
import {
  clearSession,
  currentUser,
  initAuth,
  json,
  newSession,
  sameOrigin,
  throttle,
} from '../../../src/infrastructure/security/auth';
import {
  checkPassword,
  hashPassword,
  validPassword,
} from '../../../src/infrastructure/security/password';
import { consumeFactor } from '../../../src/infrastructure/security/second-factor';
export async function GET() {
  try {
    return json({ user: preview ? null : await currentUser(), preview });
  } catch {
    return json({ error: 'No se puede conectar con el servidor' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    if (preview) return json({ error: 'Usa el servidor en el puerto 8080' }, 400);
    await initAuth();
    const b = await readJsonObject(req, 8192);
    if (b.action === 'logout') {
      await clearSession();
      return json({ ok: true });
    }
    if (b.action === 'logoutAll') {
      const u = await currentUser(true, true);
      if (!u) return json({ error: 'Inicia sesión' }, 401);
      await pool.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
      await clearSession();
      return json({ ok: true });
    }
    if (b.action === 'password') {
      const u = await currentUser(true, true);
      if (!u) return json({ error: 'Inicia sesión' }, 401);
      if (b.password === b.currentPassword)
        return json({ error: 'Elige una contraseña distinta de la actual' }, 400);
      if (
        !validPassword(b.password) ||
        typeof b.currentPassword !== 'string' ||
        b.currentPassword.length > 128
      )
        return json({ error: 'La contraseña nueva debe tener entre 12 y 128 caracteres' }, 400);
      if (!(await throttle('security:' + u.id)))
        return json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429);
      const r = await pool.query('SELECT password_hash,totp_secret FROM app_users WHERE id=$1', [
        u.id,
      ]);
      if (!(await checkPassword(b.currentPassword, r.rows[0].password_hash)))
        return json({ error: 'Contraseña actual incorrecta' }, 400);
      if (r.rows[0].totp_secret && !(await consumeFactor(u.id, b.code, r.rows[0].password_hash)))
        return json({ error: 'Código de verificación incorrecto o ya utilizado' }, 400);
      await pool.query('DELETE FROM auth_attempts WHERE username=$1', ['security:' + u.id]);
      const newHash = await hashPassword(b.password);
      const updated = await pool.query(
        'UPDATE app_users SET password_hash=$1,must_change=false WHERE id=$2 AND password_hash=$3 AND active=true RETURNING id',
        [newHash, u.id, r.rows[0].password_hash],
      );
      if (!updated.rowCount)
        return json({ error: 'La cuenta ha cambiado. Inicia sesión de nuevo' }, 401);
      await pool.query('DELETE FROM app_sessions WHERE user_id=$1', [u.id]);
      await securityEvent({ actor: u.id, target: u.id, event: 'password.changed' });
      await newSession(u.id, newHash, r.rows[0].totp_secret);
      return json({ ok: true });
    }
    if (
      b.action !== 'login' ||
      typeof b.username !== 'string' ||
      typeof b.password !== 'string' ||
      b.password.length > 128
    )
      return json({ error: 'Credenciales no válidas' }, 400);
    const username = b.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(username))
      return json({ error: 'Usuario, contraseña o código incorrectos' }, 401);
    if (!(await throttle('__global_login__', 60, 60)) || !(await throttle(username)))
      return json({ error: 'Demasiados intentos. Espera antes de volver a intentarlo.' }, 429);
    const r = await pool.query(
      "SELECT * FROM app_users u WHERE username=$1 AND active=true AND (role='developer' OR EXISTS(SELECT 1 FROM crm_memberships m WHERE m.user_id=u.id AND m.active AND (m.access_until IS NULL OR m.access_until>now())))",
      [username],
    );
    const hash = r.rows[0]?.password_hash || '00000000000000000000000000000000:' + '0'.repeat(128);
    if (!(await checkPassword(b.password, hash)) || !r.rowCount) {
      await securityEvent({ target: r.rows[0]?.id, event: 'login', result: 'denied' });
      return json({ error: 'Usuario, contraseña o código incorrectos' }, 401);
    }
    if (r.rows[0].totp_secret && !b.code) return json({ requiresCode: true });
    if (
      r.rows[0].totp_secret &&
      !(await consumeFactor(r.rows[0].id, b.code, r.rows[0].password_hash))
    )
      return json({ error: 'Usuario, contraseña o código incorrectos' }, 401);
    await pool.query('DELETE FROM auth_attempts WHERE username=$1', [username]);
    await securityEvent({ actor: r.rows[0].id, event: 'login' });
    await newSession(r.rows[0].id, r.rows[0].password_hash, r.rows[0].totp_secret);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof RequestInputError) return json({ error: e.message }, e.status);
    return json({ error: 'No se ha podido completar el acceso' }, 503);
  }
}
