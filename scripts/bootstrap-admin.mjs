import pg from 'pg';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('LOCK TABLE app_users IN EXCLUSIVE MODE');
  const n = await db.query('SELECT count(*) FROM app_users');
  if (Number(n.rows[0].count) !== 0)
    throw Error('Ya existen cuentas. No se ha modificado ninguna.');
  const password = randomBytes(24).toString('base64url'),
    salt = randomBytes(16).toString('hex'),
    hash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
  await db.query(
    "INSERT INTO app_users(id,username,password_hash,role,profile) VALUES($1,'developer',$2,'developer','Alex')",
    [randomUUID(), hash],
  );
  await db.query(
    "INSERT INTO crm_memberships(workspace_id,user_id,role,profile) SELECT 'nexo',id,role,profile FROM app_users WHERE username='developer' ON CONFLICT DO NOTHING",
  );
  await db.query('COMMIT');
  console.log(
    'NEXO · Acceso inicial local\nhttp://localhost:8180\nUsuario: developer\nContraseña temporal: ' +
      password +
      '\n\nAl entrar se solicita una contraseña personal (mínimo 12 caracteres). Guarda esta información de forma privada y elimina este archivo después del cambio.',
  );
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}
