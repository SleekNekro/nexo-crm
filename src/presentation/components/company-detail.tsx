'use client';
import ActivityPriorityBadge from './activity-priority-badge';
import { compareActivities } from '../../domain/activity-priority';
import { companyStatuses, companyStatus } from '../../domain/company-status';
import { PermissionSelect } from './permission-controls';
import { useState } from 'react';
import { FormDialog } from './dialog';
import { displayedQuote } from '../../domain/commercial-followup';
import { companyRemoval } from '../../domain/company-removal';
import { PermissionButton } from './permission-controls';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck,
  Check,
  FileText,
  KanbanSquare,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import type { Company, Data, Deal, Task } from '../../domain/model';
import { money, stages, subtotal, total } from '../../domain/model';
type Props = {
  company: Company;
  data: Data;
  deals: Deal[];
  busy: boolean;
  error: string;
  onBack: () => void;
  onDelete: () => Promise<boolean | undefined>;
  onStatus: (status: string) => void;
  onOpenDeal: (id: string) => void;
  onOpenQuote: (id: string) => void;
  onCreateQuote: () => Promise<void>;
  onCreate: (type: string) => void;
  onEditCompany: () => void;
  onEditActivity: (t: Task) => void;
  onEditContact: (id: string) => void;
  onTask: (id: string, done: boolean) => void;
  onPrint: (d: Deal, v: Deal['versions'][number]) => void;
};
export default function CompanyDetail({
  company: c,
  data,
  deals,
  busy,
  error,
  onBack,
  onDelete,
  onStatus,
  onOpenDeal,
  onOpenQuote,
  onCreate,
  onCreateQuote,
  onEditCompany,
  onEditActivity,
  onEditContact,
  onTask,
  onPrint,
}: Props) {
  const [deleting, setDeleting] = useState(false);
  const removal = companyRemoval(data, c.id);
  const related = deals.filter((d) => d.companyId === c.id),
    ids = new Set(related.map((d) => d.id));
  const contacts = data.contacts.filter((x) => x.companyId === c.id),
    tasks = data.tasks
      .filter((t) => ids.has(t.dealId))
      .sort(
        (a, b) =>
          Number(a.done || !!a.cancelled) - Number(b.done || !!b.cancelled) ||
          compareActivities(a, b),
      );
  const quotes = related,
    pending = tasks.filter((t) => !t.done && !t.cancelled);
  return (
    <div className="companyprofile">
      <button className="backlink" onClick={onBack}>
        <ArrowLeft size={16} /> Todas las empresas
      </button>
      <section className="companyhero">
        <div>
          <div className="eyebrow">FICHA DE EMPRESA</div>
          <h1>{c.name}</h1>
          <label className="company-status-editor">
            Estado comercial
            <PermissionSelect
              action="companies"
              disabled={busy}
              value={companyStatus(c, data)}
              onChange={(e) => onStatus(e.target.value)}
            >
              {companyStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </PermissionSelect>
          </label>
          <p>
            {[c.sector, c.city].filter(Boolean).join(' · ') || 'Sin sector ni ciudad registrados'}
          </p>
          {(c.taxId || c.address) && (
            <p>
              {[c.taxId, c.address, [c.postalCode, c.city, c.province].filter(Boolean).join(' ')]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="companymetadata">
            <span>
              Responsable <strong>{c.owner}</strong>
            </span>
            <span>{c.email ? <a href={'mailto:' + c.email}>{c.email}</a> : 'Sin correo'}</span>
            <span>{c.phone ? <a href={'tel:' + c.phone}>{c.phone}</a> : 'Sin teléfono'}</span>
          </div>
        </div>
        <div className="companyactions">
          <PermissionButton
            action="deals"
            disabled={busy}
            className="primary"
            onClick={() => void onCreateQuote()}
          >
            <FileText size={16} /> Crear presupuesto
          </PermissionButton>
          <PermissionButton action="companies" disabled={busy} onClick={onEditCompany}>
            <Pencil size={15} /> Editar empresa
          </PermissionButton>
          <PermissionButton action="companies" disabled={busy} onClick={() => setDeleting(true)}>
            Eliminar empresa
          </PermissionButton>
          <PermissionButton action="deals" disabled={busy} onClick={() => onCreate('Trato')}>
            <Plus size={16} /> Nuevo trato
          </PermissionButton>
        </div>
      </section>
      {deleting && (
        <FormDialog
          title="Eliminar empresa"
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
        >
          <h2>Eliminar {c.name}</h2>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {removal.reason ? (
            <>
              <p role="alert">{removal.reason}</p>
              <p>
                {removal.deals} tratos · {removal.works} obras vinculadas.
              </p>
            </>
          ) : (
            <>
              <p>
                Se eliminará esta empresa y{' '}
                {removal.contacts
                  ? `sus ${removal.contacts} contactos`
                  : 'no hay contactos asociados'}
                . Esta acción no se puede deshacer desde la aplicación.
              </p>
              <p>Los datos de las otras empresas se conservan.</p>
            </>
          )}
          <div className="formactions">
            <button disabled={busy} onClick={() => setDeleting(false)}>
              Cancelar
            </button>
            {!removal.reason && (
              <PermissionButton
                action="companies"
                disabled={busy}
                className="danger"
                onClick={async () => {
                  if (await onDelete()) setDeleting(false);
                }}
              >
                {busy ? 'Eliminando…' : 'Eliminar empresa y sus contactos'}
              </PermissionButton>
            )}
          </div>
        </FormDialog>
      )}
      <div className="companysummary">
        {[
          [Users, contacts.length, 'Contactos'],
          [KanbanSquare, related.length, 'Tratos'],
          [FileText, quotes.length, 'Presupuestos'],
          [CalendarCheck, pending.length, 'Actividades pendientes'],
        ].map(([Icon, count, label]) => {
          const Symbol = Icon as typeof Users;
          return (
            <div key={String(label)}>
              <Symbol size={19} />
              <strong>{String(count)}</strong>
              <span>{String(label)}</span>
            </div>
          );
        })}
      </div>
      <div className="companysections">
        <section className="card">
          <div className="sectionhead">
            <div>
              <h2>Contactos</h2>
              <p>Las personas con las que te relacionas</p>
            </div>
            <PermissionButton
              action="companies"
              className="link"
              onClick={() => onCreate('Contacto')}
            >
              <Plus size={14} /> Añadir contacto
            </PermissionButton>
          </div>
          <div className="contactlist">
            {contacts.map((ct) => (
              <article className="contactitem" key={ct.id}>
                <span className="avatar">{ct.name[0]}</span>
                <div>
                  <strong>{ct.name}</strong>
                  <small>{ct.role || 'Sin cargo'}</small>
                  <p>
                    {ct.email ? <a href={'mailto:' + ct.email}>{ct.email}</a> : 'Sin correo'}
                    <br />
                    {ct.phone ? <a href={'tel:' + ct.phone}>{ct.phone}</a> : 'Sin teléfono'}
                  </p>
                </div>
                <PermissionButton
                  action="companies"
                  className="contactedit"
                  disabled={busy}
                  aria-label={'Editar contacto ' + ct.name}
                  onClick={() => onEditContact(ct.id)}
                >
                  <Pencil size={14} /> Editar
                </PermissionButton>
              </article>
            ))}
          </div>
          {!contacts.length && <p className="empty">Esta empresa todavía no tiene contactos.</p>}
        </section>
        <section className="card">
          <div className="sectionhead">
            <div>
              <h2>Actividades</h2>
              <p>Pendientes y completadas de sus tratos</p>
            </div>
            <PermissionButton
              action="tasks"
              className="link"
              disabled={!related.length}
              onClick={() => onCreate('Actividad')}
            >
              <Plus size={14} /> Programar
            </PermissionButton>
          </div>
          {tasks.map((t) => (
            <div className={'taskrow ' + (t.done ? 'done' : '')} key={t.id}>
              <PermissionButton
                action="tasks"
                className="check"
                disabled={busy}
                aria-label={(t.done || t.cancelled ? 'Reabrir ' : 'Completar ') + t.title}
                onClick={() => onTask(t.id, !t.done && !t.cancelled)}
              >
                {t.done && !t.cancelled && <Check size={14} />}
              </PermissionButton>
              <div>
                <strong>{t.title}</strong>
                {t.result && <p className="activity-result">Resultado: {t.result}</p>}
                <ActivityPriorityBadge task={t} />
                <small>
                  {t.kind} · {t.owner} · {t.cancelled || (t.done ? 'Completada' : 'Pendiente')}
                </small>
                <button className="relatedlink" onClick={() => onOpenDeal(t.dealId)}>
                  {related.find((d) => d.id === t.dealId)?.title}
                </button>
              </div>
              <PermissionButton action="tasks" disabled={busy} onClick={() => onEditActivity(t)}>
                Editar
              </PermissionButton>
              <span className="due">
                {new Date(t.due + 'T12:00:00').toLocaleDateString('es-ES')}
              </span>
            </div>
          ))}
          {!tasks.length && (
            <p className="empty">
              No hay actividades.{' '}
              {related.length
                ? 'Programa el próximo seguimiento.'
                : 'Crea un trato para asociarle actividades.'}
            </p>
          )}
        </section>
        <section className="card companywide">
          <div className="sectionhead">
            <div>
              <h2>Tratos</h2>
              <p>Todas las oportunidades de esta empresa</p>
            </div>
            <span className="companyamount">
              {money(
                related
                  .filter((d) => !['Ganado', 'Perdido'].includes(d.stage))
                  .reduce((s, d) => s + subtotal(d.lines), 0),
              )}{' '}
              <small>en curso, sin impuestos</small>
            </span>
          </div>
          {related.length ? (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Trato</th>
                    <th>Fase</th>
                    <th>Responsable</th>
                    <th>Base presupuestada</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {related.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <button className="recordlink" onClick={() => onOpenDeal(d.id)}>
                          {d.title}
                        </button>
                      </td>
                      <td>
                        <span className={'badge s' + stages.indexOf(d.stage)}>{d.stage}</span>
                      </td>
                      <td>{d.owner}</td>
                      <td>
                        {money(
                          subtotal(
                            d.stage === 'Ganado'
                              ? data.orders.find((o) => o.dealId === d.id)?.lines ||
                                  displayedQuote(d).lines
                              : d.lines,
                          ),
                        )}
                      </td>
                      <td>
                        <button
                          className="link"
                          aria-label={'Abrir ' + d.title}
                          onClick={() => onOpenDeal(d.id)}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">Todavía no hay tratos para esta empresa.</p>
          )}
        </section>
        <section className="card companywide">
          <div className="sectionhead">
            <div>
              <h2>Presupuestos</h2>
              <p>Borradores y revisiones guardadas de esta empresa</p>
            </div>
            <PermissionButton action="deals" disabled={busy} onClick={() => void onCreateQuote()}>
              <Plus size={16} /> Crear presupuesto
            </PermissionButton>
          </div>
          {quotes.map((d) => (
            <article className="companyquote" key={d.id}>
              <div className="quotehead">
                <div>
                  <button className="recordlink" onClick={() => onOpenDeal(d.id)}>
                    {d.title}
                  </button>
                  <small>{d.versions.length} revisiones guardadas</small>
                </div>
                <div>
                  <strong>{money(total(displayedQuote(d).lines))}</strong>
                  <small>{displayedQuote(d).label} · con impuestos</small>
                </div>
                <button onClick={() => onOpenQuote(d.id)}>Ver presupuesto</button>
              </div>
              {d.versions.map((v, i) => (
                <div className="revision" key={v.id}>
                  <span>
                    Revisión {i + 1} · {new Date(v.date).toLocaleDateString('es-ES')} ·{' '}
                    {money(total(v.lines))}
                  </span>
                  <button onClick={() => onPrint(d, v)}>Imprimir / PDF</button>
                </div>
              ))}
            </article>
          ))}
          {!quotes.length && (
            <p className="empty">
              Crea un presupuesto para esta empresa y añade sus productos o partidas.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
