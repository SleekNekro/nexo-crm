import { applyEntityChanges, entityChanges } from '../../../src/domain/entity-changes';
import { visibleData } from '../../../src/application/access';
import {
  reconcileCommercialChange,
  validateBusinessChange,
} from '../../../src/application/business-rules';
import { saveWorkspace } from '../../../src/application/save-workspace';
import { validData } from '../../../src/domain/actions';
import { seed } from '../../../src/domain/model';
import { initData, pool, preview } from '../../../src/infrastructure/db';
import { readEntities } from '../../../src/infrastructure/entity-store';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
const state = globalThis as typeof globalThis & {
  crmPreview?: { version: number; data: ReturnType<typeof seed> };
};
const businessDay = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
function memory() {
  return (state.crmPreview ??= { version: 1, data: seed() });
}
export async function GET(req: Request) {
  try {
    if (preview)
      return json(
        new URL(req.url).searchParams.get('since') === String(memory().version)
          ? { unchanged: true, version: memory().version }
          : { ...memory(), storage: 'memory' },
      );
    const user = await currentUser(req.headers.get('x-session-probe') !== '1');
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (user.mustChange) return json({ error: 'Cambia tu contraseña para continuar' }, 403);
    await initData();
    const since = new URL(req.url).searchParams.get('since');
    if (since !== null) {
      const version = await pool.query('SELECT version FROM crm_state_meta WHERE id=1');
      if (String(version.rows[0]?.version) === since)
        return json({ unchanged: true, version: version.rows[0].version, storage: 'postgres' });
    }
    const r = await readEntities(pool);
    return json({
      version: r.rows[0].version,
      data: visibleData(r.rows[0].data, user),
      storage: 'postgres',
    });
  } catch {
    return json({ error: 'No se puede conectar con la base de datos' }, 503);
  }
}
export async function PUT(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const user = preview ? null : await currentUser();
    if (!preview && !user) return json({ error: 'Inicia sesión' }, 401);
    if (user && !matchesWorkspace(req, user))
      return json({ error: 'Recarga la página: el espacio ha cambiado' }, 409);
    if (user?.mustChange) return json({ error: 'Cambia tu contraseña para continuar' }, 403);
    const b = await req.json();
    if (!Number.isInteger(b.version) || (!b.data && !Array.isArray(b.changes)))
      return json({ error: 'Datos no válidos' }, 400);
    if (preview) {
      const before = memory().data;
      if (b.changes) b.data = applyEntityChanges(before, b.changes);
      if (!validData(b.data)) return json({ error: 'Datos no válidos' }, 400);
      if (b.version !== memory().version) return json({ error: 'Conflicto de edición' }, 409);
      try {
        b.data = reconcileCommercialChange(
          memory().data,
          b.data,
          () => crypto.randomUUID(),
          businessDay(),
        );
        validateBusinessChange(memory().data, b.data);
      } catch (e) {
        return json({ error: (e as Error).message }, 422);
      }
      state.crmPreview = { version: b.version + 1, data: b.data };
      return json(
        b.changes
          ? {
              version: memory().version,
              changes: entityChanges(before, memory().data),
              zoneProgress: memory().data.zoneProgress,
              storage: 'memory',
            }
          : { ...memory(), storage: 'memory' },
      );
    }
    const saved = await saveWorkspace(b, user!);
    return json(saved.body, saved.status);
  } catch {
    return json({ error: 'No se han guardado los cambios' }, 500);
  }
}

export const PATCH = PUT;
