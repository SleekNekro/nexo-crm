import type { Data, Work } from '../../domain/model';
import { money } from '../../domain/model';
import { compareWorkCost, workCosts } from '../../domain/labor';
import { workProgress } from '../../domain/progress';

export default function WorkCardMetrics({ data, work }: { data: Data; work: Work }) {
  const progress = workProgress(data, work.id),
    cost = workCosts(data, work.id),
    comparison = compareWorkCost(data, work);
  const missingHours = cost.missingHours + cost.supervisionMissingHours;
  return (
    <div className="work-card-metrics">
      <div className="work-card-progress">
        <span>Avance confirmado</span>
        <strong>
          {progress.percent === null ? 'Sin planificar' : progress.percent.toFixed(1) + '%'}
        </strong>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: (progress.percent || 0) + '%' }} />
      </div>
      <div className="work-card-costs">
        <div>
          <span>Coste previsto</span>
          <strong>{comparison.planned === null ? 'Sin definir' : money(comparison.planned)}</strong>
        </div>
        <div>
          <span>Coste real registrado</span>
          <strong>{money(cost.total)}</strong>
        </div>
      </div>
      <small>Importes sin IVA · Costes confirmados y valorados</small>
      {comparison.remaining !== null && (
        <p className={'work-card-difference' + (comparison.exceeded ? ' exceeded' : '')}>
          {comparison.exceeded ? 'Sobre la previsión: ' : 'Hasta el coste previsto: '}
          <b>{money(Math.abs(comparison.remaining))}</b>
        </p>
      )}
      {comparison.incomplete && (
        <div className="work-card-pending">
          <strong>Coste incompleto</strong>
          {missingHours > 0 && <span>{missingHours} h sin tarifa</span>}
          {cost.pendingHours > 0 && <span>{cost.pendingHours} h por confirmar</span>}
          {cost.pendingExpenses > 0 && (
            <span>{money(cost.pendingExpenses)} en gastos por confirmar</span>
          )}
          {cost.legacyHours > 0 && <span>{cost.legacyHours} h de partes antiguos sin valorar</span>}
        </div>
      )}
    </div>
  );
}
