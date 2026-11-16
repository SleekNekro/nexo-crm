import { compareWorkCost } from '../../domain/labor';
import type { Data, Work } from '../../domain/model';
import { money } from '../../domain/model';
export default function WorkCostComparison({ data, work }: { data: Data; work: Work }) {
  const b = compareWorkCost(data, work);
  return (
    <section className="card costcomparison">
      <h2>Coste previsto y coste confirmado</h2>
      <p>Importes sin IVA. Define la previsión en «Editar obra».</p>
      <div className="metrics workmetrics">
        <div className="metric">
          <span>Coste previsto total</span>
          <strong>{b.planned === null ? 'Sin definir' : money(b.planned)}</strong>
        </div>
        <div className="metric">
          <span>Coste confirmado</span>
          <strong>{money(b.actual)}</strong>
        </div>
        <div className={'metric ' + (b.exceeded ? 'budgetexceeded' : '')}>
          <span>{b.exceeded ? 'Exceso sobre lo previsto' : 'Disponible sobre lo previsto'}</span>
          <strong>{b.remaining === null ? '—' : money(Math.abs(b.remaining))}</strong>
        </div>
      </div>
      {b.planned !== null && (
        <>
          <div className={'progress ' + (b.exceeded ? 'budgetexceeded' : '')}>
            <span style={{ width: Math.min(100, b.percent ?? (b.exceeded ? 100 : 0)) + '%' }} />
          </div>
          <p>
            {b.percent === null
              ? b.planned === 0
                ? 'Previsión fijada en 0 €.'
                : ''
              : b.percent + '% del coste previsto consumido.'}
            {b.exceeded ? ' El coste confirmado ya supera la previsión.' : ''}
          </p>
        </>
      )}
      {b.incomplete && (
        <p className="incident">
          Comparación incompleta: hay horas o gastos pendientes de confirmar o valorar.
        </p>
      )}
      <p className="muted">
        El disponible no es beneficio ni ahorro final: no incluye costes futuros ni registros
        pendientes. La previsión no modifica el presupuesto de venta ni las tarifas.
      </p>
    </section>
  );
}
