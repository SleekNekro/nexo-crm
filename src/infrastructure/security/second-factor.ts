import { systemPool as pool } from '../system-db';
import { decryptSecret, recoveryHash, validStep } from './totp';
// Atomically consume a TOTP step or single-use recovery code.
export async function consumeFactor(id: string, code: unknown, expectedHash: string) {
  if (typeof code !== 'string' || code.length > 80) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      'SELECT * FROM app_users WHERE id=$1 AND password_hash=$2 AND active=true FOR UPDATE',
      [id, expectedHash],
    );
    const u = r.rows[0];
    if (!u?.totp_secret) {
      await client.query('ROLLBACK');
      return false;
    }
    const step = validStep(decryptSecret(u.totp_secret), code, Number(u.totp_last_step));
    if (step !== null)
      await client.query('UPDATE app_users SET totp_last_step=$1 WHERE id=$2', [step, id]);
    else {
      const hash = recoveryHash(code),
        codes = u.recovery_hashes as string[];
      if (!codes.includes(hash)) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('UPDATE app_users SET recovery_hashes=$1 WHERE id=$2', [
        JSON.stringify(codes.filter((x) => x !== hash)),
        id,
      ]);
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
