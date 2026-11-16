'use client';
import { useEffect, useState } from 'react';
import { money } from '../../domain/model';
type Event = {
  id: string;
  kind: string;
  action: string;
  reason: string;
  actor_name: string;
  created_at: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
};
const labels: Record<string, string> = {
  date: 'Fecha',
  person: 'Responsable',
  hours: 'Horas',
  rate: 'Coste por hora',
  amount: 'Importe',
  concept: 'Concepto',
  kind: 'Categoría',
  status: 'Estado',
  notes: 'Detalle',
  quantity: 'Cantidad',
  unit: 'Unidad',
};
const display = (key: string, value: unknown) =>
  value == null
    ? 'Sin definir'
    : ['amount', 'rate'].includes(key) && typeof value === 'number'
      ? money(value)
      : String(value);
export default function WorkHistory({ workId }: { workId: string }) {
  const [events, setEvents] = useState<Event[]>([]),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load(before?: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(
        '/api/work-history?' + new URLSearchParams({ workId, ...(before ? { before } : {}) }),
      );
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setEvents((old) => (before ? [...old, ...b.events] : b.events));
      setMore(b.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [workId]);
  return (
    <section className="card">
      <div className="sectionhead">
        <h2>Historial de supervisión y gastos</h2>
        <button disabled={busy} onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      <p>
        Registro generado por el servidor. Conserva valores anteriores y eliminaciones desde la
        activación del historial.
      </p>
      {error && <p className="error">{error}</p>}
      {!busy && !events.length && !error && (
        <p className="empty">Todavía no se han registrado cambios.</p>
      )}
      {events.map((e) => (
        <article className="work-update" key={e.id}>
          <strong>
            {e.action} · {e.kind === 'expense' ? 'Gasto' : 'Supervisión'}
          </strong>
          <p>
            {e.actor_name} · {new Date(e.created_at).toLocaleString('es-ES')}
          </p>
          <p>{e.reason}</p>
          <details>
            <summary>Ver valores del cambio</summary>
            <dl className="dealdata">
              {Object.entries(labels)
                .filter(
                  ([key]) =>
                    JSON.stringify(e.before_value?.[key]) !== JSON.stringify(e.after_value?.[key]),
                )
                .map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {display(key, e.before_value?.[key])} → {display(key, e.after_value?.[key])}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
        </article>
      ))}
      {more && (
        <button disabled={busy} onClick={() => void load(events.at(-1)?.id)}>
          Ver cambios anteriores
        </button>
      )}
    </section>
  );
}
