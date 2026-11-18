'use client';
import { useMoney } from '../hooks/use-business-settings';
import { PermissionButton, useCanAction } from './permission-controls';
import { useEffect, useState } from 'react';
import type { Product } from '../../domain/product';
import {} from '../../domain/model';
export default function ProductCatalogue({
  onSelect,
  onAdd,
  disabled = false,
}: {
  onSelect?: (product: Product) => void;
  onAdd?: (items: { product: Product; qty: number }[]) => Promise<boolean>;
  disabled?: boolean;
}) {
  const money = useMoney();
  const canMaintain = useCanAction('products');
  const [editing, setEditing] = useState<Product | null>(null),
    [saving, setSaving] = useState(false),
    [onlyFavorites, setOnlyFavorites] = useState(false);
  async function updateProduct(product: Product, favorite?: boolean) {
    setSaving(true);
    setNotice('');
    try {
      const r = await fetch('/api/products', {
        method: favorite === undefined && product.version === undefined ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          favorite === undefined
            ? {
                code: product.code,
                name: product.name,
                family: product.family,
                price: product.price,
                active: product.active,
                version: product.version,
              }
            : { code: product.code, favorite },
        ),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setProducts((current) =>
        current.some((p) => p.code === product.code)
          ? current.map((p) =>
              p.code === product.code ? { ...p, ...(b.product || { favorite }) } : p,
            )
          : [b.product, ...current],
      );
      if (favorite === undefined) {
        setEditing(null);
        setNotice('Producto actualizado. Los presupuestos existentes conservan su precio.');
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const picking = !!onSelect || !!onAdd;
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/products', { signal: controller.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error || 'No se ha podido cargar el catálogo');
        setProducts(b.products);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  const available = products.filter((p) => !picking || p.active);
  const matches = available.filter(
    (p) =>
      (!onlyFavorites || p.favorite) &&
      (!family || p.family === family) &&
      normalize(query)
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => normalize(p.code + ' ' + p.name).includes(word)),
  );
  return (
    <section className={'product-catalogue' + (picking ? ' product-picker' : '')}>
      {!picking && (
        <div className="heading">
          <div>
            <h1>Catálogo</h1>
            <p>Productos NEXO · precios sin IVA, antes de descuentos.</p>
          </div>
        </div>
      )}
      {!picking && canMaintain && (
        <PermissionButton
          action="products"
          type="button"
          disabled={saving}
          onClick={() =>
            setEditing({ code: '', name: '', family: '', price: 0, description: '', active: true })
          }
        >
          Nuevo producto
        </PermissionButton>
      )}
      <div className="teamfilters">
        <label>
          Buscar producto
          <input
            type="search"
            value={query}
            placeholder="Nombre o referencia"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
          />
        </label>
        <label>
          Familia
          <select
            value={family}
            onChange={(e) => {
              setFamily(e.target.value);
              setLimit(30);
            }}
          >
            <option value="">Todas las familias</option>
            {[...new Set(available.map((p) => p.family))].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={onlyFavorites}
          onChange={(e) => setOnlyFavorites(e.target.checked)}
        />{' '}
        Solo favoritos
      </label>
      {notice && <p role="status">{notice}</p>}
      {editing && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void updateProduct(editing);
          }}
        >
          <h2>{editing.version === undefined ? 'Nuevo producto' : 'Editar ' + editing.name}</h2>
          {editing.version === undefined && (
            <>
              {(['code', 'name', 'family'] as const).map((key) => (
                <label key={key}>
                  {{ code: 'Referencia', name: 'Nombre', family: 'Familia' }[key]}
                  <input
                    required={key !== 'family'}
                    maxLength={key === 'code' ? 100 : key === 'name' ? 300 : 150}
                    value={editing[key]}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                  />
                </label>
              ))}
            </>
          )}
          <label>
            Precio sin IVA
            <input
              required
              type="number"
              min="0"
              max="999999999999"
              step="0.01"
              value={editing.price}
              onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={editing.active}
              onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
            />{' '}
            Disponible para presupuestos
          </label>
          <div className="form-actions">
            <button type="button" disabled={saving} onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <PermissionButton action="products" disabled={saving}>
              Guardar producto
            </PermissionButton>
          </div>
        </form>
      )}
      {loading ? (
        <p role="status">Cargando catálogo…</p>
      ) : error ? (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
        </p>
      ) : (
        <>
          <p role="status">
            {matches.length} productos{picking ? ' activos' : ''} · mostrando{' '}
            {Math.min(limit, matches.length)}
          </p>
          <div className="product-results">
            {matches.slice(0, limit).map((p) => (
              <article className="product-result" key={p.code}>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.family} · Ref. {p.code}
                  </small>
                  {!p.active && <span>No disponible para presupuestos</span>}
                  <small className="product-price-history">
                    {p.updatedAt
                      ? 'Actualizado: ' + new Date(p.updatedAt).toLocaleString('es-ES')
                      : 'Precio del catálogo importado'}
                  </small>
                  <div className="product-actions">
                    <button
                      type="button"
                      disabled={saving}
                      aria-pressed={!!p.favorite}
                      onClick={() => void updateProduct(p, !p.favorite)}
                    >
                      {p.favorite ? '★ Favorito' : '☆ Añadir favorito'}
                    </button>
                    {!picking && canMaintain && (
                      <PermissionButton
                        action="products"
                        type="button"
                        disabled={saving}
                        onClick={() => setEditing({ ...p })}
                      >
                        Editar precio y disponibilidad
                      </PermissionButton>
                    )}
                  </div>
                </div>
                <div>
                  <strong>{money(p.price)}</strong>
                  {onAdd && (
                    <div className="product-pick-controls">
                      <label>
                        Cantidad
                        <input
                          aria-label={'Cantidad de ' + p.name}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={selection[p.code] ?? 1}
                          disabled={disabled || adding}
                          onChange={(e) =>
                            setSelection((current) => ({
                              ...current,
                              [p.code]: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <PermissionButton
                        action="deals"
                        type="button"
                        aria-pressed={p.code in selection}
                        disabled={disabled || adding}
                        onClick={() => {
                          setNotice('');
                          setSelection((current) => {
                            const next = { ...current };
                            if (p.code in next) delete next[p.code];
                            else next[p.code] = 1;
                            return next;
                          });
                        }}
                      >
                        {p.code in selection ? 'Seleccionado ✓' : 'Seleccionar'}
                      </PermissionButton>
                    </div>
                  )}
                  {onSelect && (
                    <PermissionButton
                      action="deals"
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(p)}
                    >
                      Usar producto
                    </PermissionButton>
                  )}
                </div>
              </article>
            ))}
          </div>
          {onAdd && (
            <div className="catalogue-selection">
              <span>{Object.keys(selection).length} productos seleccionados</span>
              {Object.values(selection).some((q) => !Number.isSafeInteger(q) || q < 1) && (
                <span role="alert">Introduce cantidades enteras: 1, 2, 3…</span>
              )}
              <PermissionButton
                action="deals"
                type="button"
                className="primary"
                disabled={
                  disabled ||
                  adding ||
                  !Object.keys(selection).length ||
                  Object.values(selection).some((q) => !Number.isSafeInteger(q) || q < 1)
                }
                onClick={async () => {
                  setAdding(true);
                  setNotice('');
                  try {
                    const items = available
                      .filter((p) => p.code in selection)
                      .map((product) => ({ product, qty: selection[product.code] }));
                    if (await onAdd(items)) {
                      setSelection({});
                      setNotice(`${items.length} productos añadidos al presupuesto`);
                    }
                  } catch {
                    setNotice('No se han podido añadir los productos. Vuelve a intentarlo.');
                  } finally {
                    setAdding(false);
                  }
                }}
              >
                {adding ? 'Añadiendo…' : 'Añadir al presupuesto'}
              </PermissionButton>
              {!!Object.keys(selection).length && (
                <PermissionButton
                  action="deals"
                  type="button"
                  disabled={adding || disabled}
                  onClick={() => setSelection({})}
                >
                  Vaciar selección
                </PermissionButton>
              )}
              {notice && <span role="status">{notice}</span>}
            </div>
          )}
          {!matches.length && <p>No hay productos con esa búsqueda.</p>}
          {matches.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + 30)}>
              Mostrar más
            </button>
          )}
        </>
      )}
    </section>
  );
}
