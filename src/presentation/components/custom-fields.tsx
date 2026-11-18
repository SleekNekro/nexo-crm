'use client';
import { useBusinessSettings } from '../hooks/use-business-settings';
import type { CustomField } from '../../domain/business-settings';
export function CustomFieldsEditor({
  entity,
  form,
  onChange,
}: {
  entity: CustomField['entity'];
  form: Record<string, string>;
  onChange: (form: Record<string, string>) => void;
}) {
  const fields = useBusinessSettings().fields.filter((f) => f.entity === entity && !f.archived);
  if (!fields.length) return null;
  return (
    <fieldset className="custom-fields">
      <legend>Más información</legend>
      <div className="settings-grid">
        {fields.map((f) => (
          <label key={f.id}>
            {f.label}
            {f.type === 'select' ? (
              <select
                value={form['custom:' + f.id] || ''}
                onChange={(e) => onChange({ ...form, ['custom:' + f.id]: e.target.value })}
              >
                <option value="">Sin indicar</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type}
                step={f.type === 'number' ? 'any' : undefined}
                maxLength={2000}
                value={form['custom:' + f.id] || ''}
                onChange={(e) => onChange({ ...form, ['custom:' + f.id]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function CustomFieldsSummary({
  entity,
  values,
}: {
  entity: CustomField['entity'];
  values?: Record<string, string>;
}) {
  const fields = useBusinessSettings().fields.filter(
    (f) => f.entity === entity && !f.archived && values?.[f.id],
  );
  if (!fields.length) return null;
  return (
    <dl className="custom-field-summary">
      {fields.map((f) => (
        <div key={f.id}>
          <dt>{f.label}</dt>
          <dd>{values![f.id]}</dd>
        </div>
      ))}
    </dl>
  );
}
