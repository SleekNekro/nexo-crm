import { canView } from '../../../src/domain/permissions';
import { currentUser, json } from '../../../src/infrastructure/security/auth';
import { memberDirectory } from '../../../src/infrastructure/workspace-store';
import { pool } from '../../../src/infrastructure/db';
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (user.mustChange || user.role === 'worker' || !canView(user, 'Equipo'))
      return json({ error: 'Acceso no permitido' }, 403);
    const r = await pool.query(
      `SELECT id,username,display_name AS name,CASE WHEN role IN ('admin','developer') THEN username ELSE profile END AS profile,active FROM (${memberDirectory}) d WHERE role IN ('commercial','admin','developer') ORDER BY username`,
      [user.workspaceId],
    );
    return json({ accounts: r.rows });
  } catch {
    return json({ error: 'No se pueden cargar responsables' }, 503);
  }
}
