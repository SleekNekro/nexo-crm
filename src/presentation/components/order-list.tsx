'use client';
import { useMoney } from '../hooks/use-business-settings';
import { PermissionButton } from './permission-controls';
import { recordId } from '../utils/record-id';
import { createWorkFromOrder } from '../../domain/actions';
import { type Data, type Deal, total } from '../../domain/model';
type Props = {
  data: Data;
  filtered: Deal[];
  deals: Deal[];
  profile: string;
  busy: boolean;
  company: (id: string) => string;
  setSelected: (id: string) => void;
  setWorkId: (id: string) => void;
  setView: (view: string) => void;
  setError: (message: string) => void;
  save: (data: Data) => Promise<boolean | undefined>;
};
const uid = () => recordId();
export default function OrderList({
  data,
  filtered,
  deals,
  profile,
  busy,
  company,
  setSelected,
  setWorkId,
  setView,
  setError,
  save,
}: Props) {
  const money = useMoney();
  return (
    <section className="card tablewrap mobile-record-cards">
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Entrega de materiales</th>
            <th>Obra opcional</th>
          </tr>
        </thead>
        <tbody>
          {data.orders
            .filter((o) => filtered.some((d) => d.id === o.dealId))
            .map((o) => {
              const d = deals.find((d) => d.id === o.dealId)!;
              return (
                <tr key={o.id}>
                  <td data-label="Pedido">
                    <button className="recordlink" onClick={() => setSelected(d.id)}>
                      {d.title}
                    </button>
                    <small>{company(d.companyId)}</small>
                    <span className="badge">
                      {data.works?.some((w) => w.orderId === o.id)
                        ? 'Ejecución de obra'
                        : 'Venta / suministro sin obra'}
                    </span>
                  </td>
                  <td data-label="Fecha">{o.date}</td>
                  <td data-label="Estado">
                    <span className="badge s1">{o.status}</span>
                  </td>
                  <td data-label="Total con impuestos">{money(total(o.lines))}</td>
                  <td data-label="Entrega de materiales">
                    <PermissionButton
                      action="orders,tasks"
                      disabled={busy || o.status === 'Recibido'}
                      onClick={() => {
                        if (
                          !confirm(
                            data.works?.some((w) => w.orderId === o.id)
                              ? '¿Confirmar que los materiales del pedido han llegado a obra? Esto no finaliza la obra.'
                              : '¿Confirmar que el cliente ha recibido los productos del pedido?',
                          )
                        )
                          return;
                        const n = structuredClone(data);
                        n.orders.find((x) => x.id === o.id)!.status = 'Recibido';
                        n.tasks
                          .filter((t) => t.dealId === d.id && t.kind === 'Recepción')
                          .forEach((t) => (t.done = true));
                        save(n);
                      }}
                    >
                      {o.status === 'Recibido'
                        ? 'Entrega confirmada'
                        : data.works?.some((w) => w.orderId === o.id)
                          ? 'Confirmar material en obra'
                          : 'Confirmar entrega al cliente'}
                    </PermissionButton>
                  </td>
                  <td data-label="Obra opcional">
                    {data.works?.some((w) => w.orderId === o.id) ? (
                      <button
                        onClick={() => {
                          setWorkId(data.works!.find((w) => w.orderId === o.id)!.id);
                          setView('Obras');
                        }}
                      >
                        Abrir obra
                      </button>
                    ) : (
                      <PermissionButton
                        action="works"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !confirm(
                              '¿Crear una obra planificada con las partidas de este pedido? Podrás completar la ubicación, equipo y costes previstos después.',
                            )
                          )
                            return;
                          try {
                            const n = createWorkFromOrder(data, o.id, profile, uid);
                            if (await save(n)) {
                              setWorkId(n.works!.find((w) => w.orderId === o.id)!.id);
                              setView('Obras');
                            }
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Crear obra
                      </PermissionButton>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <p className="muted">
        El pedido conserva las partidas aceptadas. Las ventas a distribuidores pueden quedarse como
        pedidos; crea una obra solo cuando haya ejecución. Confirmar la entrega cierra el
        seguimiento de recepción de materiales, no la obra ni un cobro.
      </p>
    </section>
  );
}
