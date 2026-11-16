'use client';
import ActivityPriorityBadge from './activity-priority-badge';
import { compareActivities } from '../../domain/activity-priority';
import { useState } from 'react';
import { companyStatus, companyStatuses } from '../../domain/company-status';
import { PermissionButton } from './permission-controls';
import { Building2, ChevronRight } from 'lucide-react';
import type { Company, Data, Deal } from '../../domain/model';
import { money, stages, subtotal } from '../../domain/model';
import { dueLabel } from './activity-list';
type Props = {
  busy: boolean;
  onCreateQuote: (id: string) => Promise<void>;
  companies: Company[];
  data: Data;
  deals: Deal[];
  onCompany: (id: string) => void;
  onDeal: (id: string, tab: string) => void;
  onContact: (id: string) => void;
};
export default function CompanyList({
  companies,
  busy,
  onCreateQuote,
  data,
  deals,
  onCompany,
  onDeal,
  onContact,
}: Props) {
  const [statusFilter, setStatusFilter] = useState('Todas');
  const shown = companies.filter(
    (c) => statusFilter === 'Todas' || companyStatus(c, data) === statusFilter,
  );
  return (
    <div className="companycascade">
      <div className="company-status-filter">
        <label>
          Estado comercial{' '}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="Todas">Todas ({companies.length})</option>
            {companyStatuses.map((status) => (
              <option key={status} value={status}>
                {status} ({companies.filter((c) => companyStatus(c, data) === status).length})
              </option>
            ))}
          </select>
        </label>
        <span>{shown.length} empresas</span>
      </div>
      <p className="muted">
        Pulsa una empresa para desplegar sus contactos, tratos, presupuestos y actividades.
      </p>
      {[...shown]
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((c) => {
          const related = deals.filter((d) => d.companyId === c.id),
            ids = new Set(related.map((d) => d.id)),
            contacts = data.contacts.filter((x) => x.companyId === c.id),
            tasks = data.tasks
              .filter((t) => ids.has(t.dealId) && !t.done && !t.cancelled)
              .sort(compareActivities),
            quotes = related;
          return (
            <details className="companybranch" name="company-list" key={c.id}>
              <summary>
                <ChevronRight className="branchchevron" size={20} />
                <span className="branchicon">
                  <Building2 size={21} />
                </span>
                <span className="branchname">
                  <strong>{c.name}</strong>
                  <span
                    className={
                      'company-status-badge company-status-' +
                      companyStatuses.indexOf(companyStatus(c, data))
                    }
                  >
                    {companyStatus(c, data)}
                  </span>
                  <small>
                    {[c.sector, c.city].filter(Boolean).join(' · ') || 'Sin sector ni ciudad'}
                  </small>
                </span>
                <span className="branchcounts">
                  {contacts.length} contactos · {related.length} tratos
                </span>
                <span className="branchowner">{c.owner}</span>
              </summary>
              <div className="branchbody">
                <div className="branchtoolbar">
                  <div>
                    {c.email && <a href={'mailto:' + c.email}>{c.email}</a>}
                    {c.phone && <a href={'tel:' + c.phone}>{c.phone}</a>}
                  </div>
                  <div className="companyactions">
                    <PermissionButton
                      action="deals"
                      className="primary"
                      disabled={busy}
                      onClick={() => void onCreateQuote(c.id)}
                    >
                      Crear presupuesto
                    </PermissionButton>
                    <button onClick={() => onCompany(c.id)}>Abrir ficha completa</button>
                  </div>
                </div>
                <div className="branchsections">
                  <section>
                    <h3>
                      Contactos <span>{contacts.length}</span>
                    </h3>
                    {contacts.map((ct) => (
                      <div className="branchrecord" key={ct.id}>
                        <PermissionButton
                          action="companies"
                          className="recordlink"
                          onClick={() => onContact(ct.id)}
                        >
                          {ct.name}
                        </PermissionButton>
                        <small>{ct.role || 'Sin cargo'}</small>
                        {ct.email && <a href={'mailto:' + ct.email}>{ct.email}</a>}
                        {ct.phone && <a href={'tel:' + ct.phone}>{ct.phone}</a>}
                      </div>
                    ))}
                    {!contacts.length && <p className="muted">Sin contactos registrados.</p>}
                  </section>
                  <section>
                    <h3>
                      Tratos <span>{related.length}</span>
                    </h3>
                    {related.map((d) => (
                      <div className="branchrecord" key={d.id}>
                        <button className="recordlink" onClick={() => onDeal(d.id, 'Resumen')}>
                          {d.title}
                        </button>
                        <div>
                          <span className={'badge s' + stages.indexOf(d.stage)}>{d.stage}</span>
                          <span>{money(subtotal(d.lines))} sin IVA</span>
                        </div>
                      </div>
                    ))}
                    {!related.length && <p className="muted">Sin tratos registrados.</p>}
                  </section>
                  <section>
                    <h3>
                      Presupuestos <span>{quotes.length}</span>
                    </h3>
                    {quotes.map((d) => (
                      <div className="branchrecord" key={d.id}>
                        <button className="recordlink" onClick={() => onDeal(d.id, 'Presupuesto')}>
                          {d.title}
                        </button>
                        <small>
                          {d.versions.length
                            ? d.versions.length + ' revisiones guardadas'
                            : 'En preparación · sin revisiones'}
                        </small>
                      </div>
                    ))}
                    {!quotes.length && <p className="muted">Sin presupuestos.</p>}
                  </section>
                  <section>
                    <h3>
                      Actividades pendientes <span>{tasks.length}</span>
                    </h3>
                    {tasks.map((t) => (
                      <div className="branchrecord" key={t.id}>
                        <button
                          className="recordlink"
                          onClick={() => onDeal(t.dealId, 'Actividades')}
                        >
                          {t.title}
                          <ActivityPriorityBadge task={t} />
                        </button>
                        <small>
                          {dueLabel(t.due)} · {t.owner}
                        </small>
                      </div>
                    ))}
                    {!tasks.length && <p className="muted">No hay actividades pendientes.</p>}
                  </section>
                </div>
              </div>
            </details>
          );
        })}
      {!shown.length && (
        <section className="card empty">
          No hay empresas que coincidan con la búsqueda y el estado seleccionado.
        </section>
      )}
    </div>
  );
}
