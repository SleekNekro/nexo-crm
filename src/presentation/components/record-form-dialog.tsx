'use client';
import {
  activityKinds,
  activityPriorities,
  activityPriority,
} from '../../domain/activity-priority';
import { companyStatuses } from '../../domain/company-status';
import { PermissionForm, PermissionButton } from './permission-controls';
import { AccountSelect } from './assignee-select';
import { possibleDuplicates } from '../../domain/commercial-followup';
import { X } from 'lucide-react';
import { daysFrom } from '../../domain/commercial-workflow';
import { localDay } from './activity-list';
import type { Data } from '../../domain/model';
import type { useRecordForms } from '../hooks/use-record-forms';
import { FormDialog } from './dialog';
type Props = {
  controller: ReturnType<typeof useRecordForms>;
  data: Data;
  profile: string;
  busy: boolean;
  error: string;
};
export default function RecordFormDialog({ controller, data, profile, busy, error }: Props) {
  const {
    modal,
    editId,
    form,
    setForm,
    setFormDirty,
    closeModal,
    create,
    continueQuote,
    companies,
    deals,
    company,
    focusedCompany,
    sel,
    formDeals,
  } = controller;
  const input = (key: string, label: string, type = 'text', required = false) => (
    <label>
      {label}
      <input
        type={type}
        inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : undefined}
        required={required}
        value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      {' '}
      {modal && (
        <FormDialog title={modal} onClose={closeModal}>
          <button aria-label="Cerrar" className="close" onClick={closeModal}>
            <X />
          </button>
          <div className="eyebrow">{editId ? 'EDITAR REGISTRO' : 'NUEVO REGISTRO'}</div>
          <h2>{editId ? 'Editar ' + modal.toLowerCase() : modal}</h2>
          {error && <p className="error">{error}</p>}
          <PermissionForm
            action={
              ['Empresa', 'Contacto'].includes(modal)
                ? 'companies'
                : modal === 'Actividad'
                  ? 'tasks'
                  : 'deals'
            }
            onChange={() => setFormDirty(true)}
            onSubmit={modal === 'Presupuesto' ? continueQuote : create}
          >
            {modal === 'Presupuesto' ? (
              <>
                <label>
                  Qué quieres hacer
                  <select
                    value={form.quoteMode || 'new'}
                    onChange={(e) => setForm({ ...form, quoteMode: e.target.value })}
                  >
                    <option value="new">Crear presupuesto para una empresa</option>
                    <option value="existing">Continuar un presupuesto existente</option>
                  </select>
                </label>
                {form.quoteMode === 'existing' ? (
                  <label>
                    Trato abierto
                    <select
                      required
                      value={form.dealId}
                      onChange={(e) => setForm({ ...form, dealId: e.target.value })}
                    >
                      <option value="">Selecciona un trato</option>
                      {deals
                        .filter((d) => !['Ganado', 'Perdido'].includes(d.stage))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title} · {company(d.companyId)}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <label>
                      Empresa
                      <select
                        required
                        value={form.companyId}
                        onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                      >
                        <option value="">Selecciona una empresa</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="muted">
                      El trato se crea automáticamente con el responsable de la empresa.
                    </p>
                    {!companies.length && (
                      <p role="status">Crea primero la empresa desde Empresas.</p>
                    )}
                  </>
                )}
              </>
            ) : (
              input('name', modal === 'Actividad' ? 'Acción pendiente' : 'Nombre', 'text', true)
            )}
            {['Contacto', 'Trato'].includes(modal) && (
              <label>
                Empresa
                <select
                  required
                  disabled={
                    !!focusedCompany ||
                    (!!editId && modal === 'Contacto') ||
                    (!!editId &&
                      modal === 'Trato' &&
                      !!sel &&
                      (sel.versions.length > 0 || data.orders.some((o) => o.dealId === sel.id)))
                  }
                  value={form.companyId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      companyId: e.target.value,
                      contactId: (() => {
                        const cs = data.contacts.filter((c) => c.companyId === e.target.value);
                        return cs.length === 1 ? cs[0].id : '';
                      })(),
                      owner: companies.find((c) => c.id === e.target.value)?.owner || form.owner,
                    })
                  }
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modal === 'Empresa' && (
              <>
                <label>
                  Estado comercial
                  <select
                    value={form.status || 'Posible cliente'}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {companyStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <details className="extra-fields" open={!!editId}>
                  <summary>Más datos de la empresa</summary>
                  {input('sector', 'Sector')}
                  {input('taxId', 'NIF / CIF')}
                  {input('address', 'Dirección fiscal')}
                  {input('postalCode', 'Código postal')}
                  {input('city', 'Ciudad')}
                  {input('province', 'Provincia')}
                </details>
                <label>
                  Responsable
                  <AccountSelect
                    value={form.owner}
                    disabled={profile !== 'Dirección'}
                    onChangeEvent={(e) => setForm({ ...form, owner: e.target.value })}
                  />
                </label>
                {editId && (
                  <p className="muted">
                    Cambiar el responsable reasigna también los tratos y actividades de esta
                    empresa.
                  </p>
                )}
              </>
            )}
            {['Empresa', 'Contacto'].includes(modal) && (
              <>
                {input('email', 'Correo', 'email')}
                {input('phone', 'Teléfono', 'tel')}
              </>
            )}
            {['Empresa', 'Contacto'].includes(modal) &&
              possibleDuplicates(modal === 'Empresa' ? data.companies : data.contacts, {
                ...form,
                id: editId,
              }).map((d) => (
                <p className="incident full" role="status" key={d.id}>
                  Posible duplicado: {d.name} · coincide {d.reasons.join(', ')}. Revisa el registro
                  antes de crear otro.
                </p>
              ))}
            {modal === 'Contacto' && (
              <details className="extra-fields" open={!!editId}>
                <summary>Más datos del contacto</summary>
                {input('role', 'Cargo')}
              </details>
            )}
            {modal === 'Trato' && (
              <details className="extra-fields" open={!!editId}>
                <summary>Más datos del trato</summary>
                <label>
                  Contacto principal
                  <select
                    value={form.contactId || ''}
                    onChange={(e) => setForm({ ...form, contactId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {data.contacts
                      .filter((c) => c.companyId === form.companyId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Responsable del trato
                  <AccountSelect
                    value={form.owner}
                    disabled={profile !== 'Dirección'}
                    onChangeEvent={(e) => setForm({ ...form, owner: e.target.value })}
                  />
                </label>
                {input('expectedClose', 'Cierre previsto', 'date')}
                <label>
                  Descripción del trato
                  <textarea
                    value={form.description || ''}
                    maxLength={4000}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </label>
                {editId && (
                  <p className="muted">
                    El responsable se aplica también a las actividades. La empresa se conserva
                    cuando existen presupuestos emitidos o pedidos.
                  </p>
                )}
              </details>
            )}
            {modal === 'Actividad' && (
              <>
                <label>
                  Trato
                  <select
                    required
                    disabled={!!sel || !!editId}
                    value={form.dealId}
                    onChange={(e) => setForm({ ...form, dealId: e.target.value })}
                  >
                    {formDeals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo
                  <select
                    disabled={!!editId && form.kind === 'Recepción'}
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  >
                    {activityKinds.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                    {form.kind === 'Recepción' && <option>Recepción</option>}
                  </select>
                </label>
                {input('due', 'Fecha', 'date', true)}
                <div className="form-actions date-shortcuts">
                  {[
                    [0, 'Hoy'],
                    [1, 'Mañana'],
                    [3, 'En 3 días'],
                  ].map(([n, label]) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => {
                        setForm({ ...form, due: daysFrom(localDay(), Number(n)) });
                        setFormDirty(true);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <details className="extra-fields" open={!!editId}>
                  <summary>Prioridad y horario (opcional)</summary>
                  <label>
                    Prioridad
                    <select
                      value={form.priority || ''}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    >
                      <option value="">
                        Automática ·{' '}
                        {activityPriority({
                          kind: form.kind || 'Tarea',
                          quoteRevisionId: data.tasks.find((t) => t.id === editId)?.quoteRevisionId,
                        })}
                      </option>
                      {activityPriorities.map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                  {input('time', 'Hora (opcional)', 'time')}
                  {form.time && (
                    <label>
                      Duración en minutos
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        step="1"
                        value={form.durationMinutes || ''}
                        onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                      />
                    </label>
                  )}
                  <p className="muted full">
                    Horario de España peninsular. Sin hora se muestra como actividad del día.
                  </p>
                </details>
              </>
            )}
            <div className="record-form-footer">
              <button type="button" className="full" disabled={busy} onClick={closeModal}>
                Cancelar
              </button>
              <PermissionButton
                action={
                  ['Empresa', 'Contacto'].includes(modal)
                    ? 'companies'
                    : modal === 'Actividad'
                      ? 'tasks'
                      : 'deals'
                }
                className="primary full"
                disabled={busy}
              >
                {busy
                  ? 'Guardando…'
                  : editId
                    ? 'Guardar cambios'
                    : modal === 'Presupuesto'
                      ? 'Continuar con las partidas'
                      : modal === 'Trato'
                        ? 'Crear trato y preparar presupuesto'
                        : 'Crear ' + modal.toLowerCase()}
              </PermissionButton>
            </div>
          </PermissionForm>
        </FormDialog>
      )}
    </>
  );
}
