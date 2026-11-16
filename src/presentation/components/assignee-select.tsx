'use client';
import { useEffect, useState } from 'react';
type Account = { id: string; name: string; profile: string; active: boolean };
export default function AssigneeSelect({
  value,
  onChange,
  disabled,
  name,
}: {
  value?: string;
  onChange?: (value: string, label: string) => void;
  disabled?: boolean;
  name?: string;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/assignees', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((b) => setAccounts(b.accounts))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  return (
    <>
      <select
        name={name}
        value={value || ''}
        disabled={disabled || loading || error}
        required
        onChange={(e) =>
          onChange?.(
            e.target.value,
            accounts.find((a) => a.profile === e.target.value)?.name || e.target.value,
          )
        }
      >
        <option value="">
          {loading
            ? 'Cargando cuentas…'
            : error
              ? 'No se pudieron cargar las cuentas'
              : 'Selecciona una cuenta'}
        </option>
        {value && !accounts.some((a) => a.profile === value) && (
          <option value={value}>{value} · sin cuenta vinculada</option>
        )}
        {accounts
          .filter((a) => a.active || a.profile === value)
          .map((a) => (
            <option key={a.id} value={a.profile} disabled={!a.active}>
              {a.name}
              {!a.active ? ' · desactivada' : ''}
            </option>
          ))}
      </select>
      {value && !loading && !error && !accounts.some((a) => a.profile === value) && (
        <small>Asignación heredada. Selecciona una cuenta real para vincular el acceso.</small>
      )}
    </>
  );
}

export function AccountSelect({
  onChangeEvent,
  ...props
}: {
  value?: string;
  name?: string;
  disabled?: boolean;
  onChangeEvent?: (e: { target: { value: string } }) => void;
}) {
  return <AssigneeSelect {...props} onChange={(value) => onChangeEvent?.({ target: { value } })} />;
}
