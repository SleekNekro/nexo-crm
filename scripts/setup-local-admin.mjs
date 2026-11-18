// Only executed locally inside the app container; never exposed as an HTTP endpoint.
import pg from 'pg';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
let raw = '';
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 4096) throw Error('Solicitud demasiado grande');
}
const { password } = JSON.parse(raw || '{}');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  await db.query('LOCK TABLE app_users IN EXCLUSIVE MODE');
  const n = await db.query('SELECT count(*) FROM app_users');
  if (Number(n.rows[0].count) !== 0) {
    await db.query('ROLLBACK');
    console.log(JSON.stringify({ created: false }));
  } else {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
      throw Error('Contraseña de 12 a 128 caracteres requerida');
    const salt = randomBytes(16).toString('hex');
    const hash = salt + ':' + scryptSync(password, salt, 64).toString('hex');
    await db.query(
      "INSERT INTO app_users(id,username,password_hash,role,profile,must_change,display_name) VALUES($1,'developer',$2,'developer','Administrador',false,'Administrador')",
      [randomUUID(), hash],
    );
    await db.query(
      "INSERT INTO crm_memberships(workspace_id,user_id,role,profile) SELECT 'nexo',id,role,profile FROM app_users WHERE username='developer' ON CONFLICT DO NOTHING",
    );
    await db.query('COMMIT');
    console.log(JSON.stringify({ created: true }));
  }
} catch {
  await db.query('ROLLBACK');
  console.error('No se pudo crear la cuenta inicial. No se han modificado las cuentas existentes.');
  process.exitCode = 1;
} finally { await db.end(); }
