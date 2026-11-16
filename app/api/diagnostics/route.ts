import { memberDirectory } from '../../../src/infrastructure/workspace-store';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { keys } from '../../../src/application/access';
import { validData } from '../../../src/domain/actions';
import { initData, pool, readState } from '../../../src/infrastructure/db';
import { photoDirectory } from '../../../src/infrastructure/photo-storage';
import { currentUser, json } from '../../../src/infrastructure/security/auth';
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (user.role !== 'developer' || user.mustChange)
      return json({ error: 'Solo Desarrollador' }, 403);
    const start = performance.now();
    await initData();
    const r = await readState(),
      dbMs = Math.round(performance.now() - start),
      d = r.rows[0].data;
    const photos = new Set<string>(
      [...(d.siteReports || []), ...(d.laborReports || [])].flatMap((r) =>
        r.photos.map((p: { src: string }) => p.src),
      ),
    );
    let missingPhotos = 0;
    for (const src of photos) {
      if (!/^\/api\/photos\/[a-f0-9]{64}$/.test(src)) {
        missingPhotos++;
        continue;
      }
      try {
        await access(path.join(photoDirectory(user.workspaceId), src.split('/').at(-1) + '.jpg'));
      } catch {
        missingPhotos++;
      }
    }
    const counts = Object.fromEntries(keys.map((k) => [k, d[k]?.length || 0]));
    const users = await pool.query(
      `SELECT role,active,count(*)::int AS count FROM (${memberDirectory}) d GROUP BY role,active`,
      [user.workspaceId],
    );
    const sessions = await pool.query(
      "SELECT count(*)::int AS count FROM public.app_sessions WHERE expires_at>now() AND last_seen>now()-interval '120 minutes' AND user_id IN (SELECT user_id FROM public.crm_memberships WHERE workspace_id=$1)",
      [user.workspaceId],
    );
    const events = await pool.query('SELECT count(*)::int AS count FROM sales_events');
    return json({
      checkedAt: new Date().toISOString(),
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        schema: 'entities-v1',
        connected: true,
        latencyMs: dbMs,
        stateVersion: r.rows[0].version,
        valid: validData(d),
      },
      counts,
      photos: { referenced: photos.size, missing: missingPhotos },
      users: users.rows,
      activeSessions: sessions.rows[0].count,
      salesEvents: events.rows[0].count,
    });
  } catch {
    return json({ error: 'No se puede completar el diagnóstico' }, 503);
  }
}
