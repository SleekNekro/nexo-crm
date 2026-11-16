import { canAct, canView } from '../../../src/domain/permissions';
import { initData, pool } from '../../../src/infrastructure/db';
import {
  currentUser,
  json,
  sameOrigin,
  matchesWorkspace,
} from '../../../src/infrastructure/security/auth';
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (!canView(user, 'Catálogo') && !canView(user, 'Presupuestos'))
      return json({ error: 'Acceso no permitido' }, 403);
    if (user.mustChange || user.role === 'worker')
      return json({ error: 'Acceso no permitido' }, 403);
    await initData();
    const result = await pool.query(
      `SELECT p.code,p.name,p.family,p.price::float8 AS price,p.description,p.active,p.updated_at AS "updatedAt",p.version,EXISTS(SELECT 1 FROM crm_product_favorites f WHERE f.code=p.code AND f.user_id=$1) AS favorite FROM crm_products p ORDER BY p.family,p.name,p.code`,
      [user.id],
    );
    return json({ products: result.rows });
  } catch {
    return json({ error: 'No se ha podido cargar el catálogo' }, 503);
  }
}

export async function PATCH(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const user = await currentUser();
    if (user && !matchesWorkspace(req, user))
      return json({ error: 'Recarga la página: el espacio ha cambiado' }, 409);
    if (!user) return json({ error: 'Inicia sesión' }, 401);
    if (
      user.mustChange ||
      user.role === 'worker' ||
      (!canView(user, 'Catálogo') && !canView(user, 'Presupuestos'))
    )
      return json({ error: 'Acceso no permitido' }, 403);
    const b = await req.json();
    if (typeof b.code !== 'string') return json({ error: 'Referencia no válida' }, 400);
    await initData();
    if (typeof b.favorite === 'boolean') {
      const exists = await pool.query('SELECT code FROM crm_products WHERE code=$1', [b.code]);
      if (!exists.rowCount) return json({ error: 'Producto no encontrado' }, 404);
      if (b.favorite)
        await pool.query(
          'INSERT INTO crm_product_favorites(user_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [user.id, b.code],
        );
      else
        await pool.query('DELETE FROM crm_product_favorites WHERE user_id=$1 AND code=$2', [
          user.id,
          b.code,
        ]);
      return json({ ok: true });
    }
    if (!canAct(user, 'products'))
      return json({ error: 'No tienes permiso para mantener el catálogo' }, 403);
    if (
      !Number.isFinite(b.price) ||
      b.price < 0 ||
      b.price > 999999999999 ||
      typeof b.active !== 'boolean' ||
      !Number.isInteger(b.version)
    )
      return json({ error: 'Precio o estado no válido' }, 400);
    const r = await pool.query(
      `UPDATE crm_products SET price=$1,active=$2,updated_at=now(),version=version+1 WHERE code=$3 AND version=$4 RETURNING code,price::float8 AS price,active,updated_at AS "updatedAt",version`,
      [Math.round(b.price * 100) / 100, b.active, b.code, b.version],
    );
    if (!r.rowCount)
      return json({ error: 'El producto ha cambiado. Recarga el catálogo antes de guardar.' }, 409);
    return json({ product: r.rows[0] });
  } catch {
    return json({ error: 'No se ha guardado el producto' }, 500);
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return json({ error: 'Origen no permitido' }, 403);
    const u = await currentUser();
    if (u && !matchesWorkspace(req, u))
      return json({ error: 'Recarga la página: el espacio ha cambiado' }, 409);
    if (!u) return json({ error: 'Inicia sesión' }, 401);
    if (u.mustChange || !canView(u, 'Catálogo') || !canAct(u, 'products'))
      return json({ error: 'No tienes permiso para crear productos' }, 403);
    const b = await req.json();
    if (
      typeof b.code !== 'string' ||
      !b.code.trim() ||
      b.code.length > 100 ||
      typeof b.name !== 'string' ||
      !b.name.trim() ||
      b.name.length > 300 ||
      typeof b.family !== 'string' ||
      b.family.length > 150 ||
      !Number.isFinite(b.price) ||
      b.price < 0 ||
      b.price > 999999999999
    )
      return json({ error: 'Revisa referencia, nombre, familia y precio' }, 400);
    await initData();
    const r = await pool.query(
      `INSERT INTO crm_products(code,name,family,price,description,active,source,updated_at) VALUES($1,$2,$3,$4,'',true,'Alta manual',now()) RETURNING code,name,family,price::float8 AS price,description,active,version,updated_at AS "updatedAt"`,
      [b.code.trim(), b.name.trim(), b.family.trim(), Math.round(b.price * 100) / 100],
    );
    return json({ product: r.rows[0] }, 201);
  } catch (e) {
    return json(
      {
        error:
          (e as { code?: string }).code === '23505'
            ? 'Ya existe esa referencia'
            : 'No se ha creado el producto',
      },
      (e as { code?: string }).code === '23505' ? 409 : 500,
    );
  }
}
