'use client';
import { BrandLogo } from './brand-logo';
import { useEffect, useState } from 'react';
import type { Identity } from '../../application/access';
import type { Worker } from '../../domain/model';
import { blankBrand, type WorkspaceBrand, type WorkspaceInfo } from '../../domain/workspace';
import { FormDialog } from './dialog';
export default function Workspaces({
  user,
  workers,
  beforeSwitch,
}: {
  user: Identity;
  workers: Worker[];
  beforeSwitch: () => boolean;
}) {
  const [open, setOpen] = useState(false),
    [spaces, setSpaces] = useState<WorkspaceInfo[]>([]),
    [accounts, setAccounts] = useState<{ id: string; username: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [creating, setCreating] = useState(false),
    [draft, setDraft] = useState<WorkspaceBrand>(user.workspace?.brand || blankBrand),
    [dirty, setDirty] = useState(false),
    [target, setTarget] = useState(''),
    [role, setRole] = useState('admin'),
    [worker, setWorker] = useState('');
  const configure = !!user.platformDeveloper;
  useEffect(() => {
    fetch('/api/workspaces')
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setSpaces(b.spaces);
        setAccounts(b.accounts);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function post(body: unknown) {
    const r = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    return b;
  }
  async function switchTo(id: string) {
    if (!beforeSwitch()) return;
    setBusy(true);
    setError('');
    try {
      await post({ action: 'switch', id });
      location.hash = '';
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const field = (key: keyof WorkspaceBrand, label: string, type = 'text') => (
    <label key={key}>
      {label}
      <input
        type={type}
        required={key === 'name'}
        maxLength={key === 'name' ? 80 : 2000}
        value={draft[key] ?? draft.primary}
        onChange={(e) => {
          setDraft({ ...draft, [key]: e.target.value });
          setDirty(true);
        }}
      />
    </label>
  );
  return (
    <>
      <button
        type="button"
        className="workspace workspace-switch"
        onClick={() => {
          setDraft(user.workspace?.brand || blankBrand);
          setCreating(false);
          setDirty(false);
          setOpen(true);
        }}
        aria-label="Cambiar empresa o configurar espacio"
      >
        <span className="logo">{(user.workspace?.brand.name || 'Empresa').slice(0, 1)}</span>
        <span className="workspace-switch-label">
          <strong>Equipo {user.workspace?.brand.name || 'Empresa'}</strong>
          <small>Cambiar empresa</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <FormDialog
          title="Empresas y espacios"
          onClose={() => {
            if (!busy && (!dirty || confirm('¿Descartar los cambios de configuración?')))
              setOpen(false);
          }}
        >
          <h2>Empresas y espacios</h2>
          <p>Los clientes, obras, presupuestos y catálogo están separados por empresa.</p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="workspace-choices">
            {spaces.map((w) => (
              <button
                type="button"
                disabled={busy || w.id === user.workspaceId}
                key={w.id}
                onClick={() => {
                  if (
                    !dirty ||
                    confirm('¿Descartar los cambios de configuración y cambiar de empresa?')
                  )
                    void switchTo(w.id);
                }}
              >
                {w.brand.logo && <BrandLogo brand={w.brand} width={60} />}
                {w.brand.name}
                {w.id === user.workspaceId ? ' · Actual' : ''}
              </button>
            ))}
          </div>
          {user.platformDeveloper && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!dirty || confirm('¿Descartar los cambios?')) {
                  setCreating(true);
                  setDraft({ ...blankBrand });
                  setDirty(false);
                  setError('');
                }
              }}
            >
              Crear empresa
            </button>
          )}
          {(configure || creating) && (
            <form
              className="formgrid workspace-brand-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!beforeSwitch()) return;
                setBusy(true);
                setError('');
                try {
                  const result = await post(
                    creating
                      ? { action: 'create', brand: draft }
                      : { action: 'brand', brand: draft, version: user.workspace?.version },
                  );
                  setDirty(false);
                  if (creating) {
                    await post({ action: 'switch', id: result.workspace.id });
                    location.hash = '';
                  }
                  location.reload();
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <h3 className="full">
                {creating ? 'Nueva empresa' : 'Identidad de ' + user.workspace?.brand.name}
              </h3>
              {field('name', 'Nombre del espacio')}
              {field('primary', 'Color principal', 'color')}
              {field('accent', 'Color secundario', 'color')}
              {field('detail', 'Color de los detalles', 'color')}
              <label className="full">
                Logo (PNG, JPG o WebP)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setError('');
                    try {
                      if (file.size > 5 * 1024 * 1024)
                        throw Error('El logo debe ocupar menos de 5 MB');
                      const bitmap = await createImageBitmap(file),
                        scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
                      const canvas = document.createElement('canvas');
                      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                      bitmap.close();
                      let logo = canvas.toDataURL('image/png');
                      if (logo.length > 250000) logo = canvas.toDataURL('image/webp', 0.85);
                      if (logo.length > 250000)
                        throw Error('Prueba con un logo más sencillo o de menor tamaño');
                      setDraft((x) => {
                        const { logoLayout, ...rest } = x;
                        return { ...rest, logo };
                      });
                      setDirty(true);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              {draft.logo && (
                <div className="full">
                  <BrandLogo brand={draft} width={180} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDraft({ ...draft, logo: '' });
                      setDirty(true);
                    }}
                  >
                    Quitar logo
                  </button>
                </div>
              )}
              {field('legalName', 'Razón social')}
              {field('taxId', 'NIF / CIF')}
              <label className="full">
                Dirección fiscal
                <textarea
                  maxLength={2000}
                  value={draft.address}
                  onChange={(e) => {
                    setDraft({ ...draft, address: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
              {field('phone', 'Teléfono')}
              {field('email', 'Correo', 'email')}
              {field('website', 'Web')}
              <label className="full">
                Condiciones de pago para presupuestos
                <textarea
                  maxLength={2000}
                  value={draft.paymentTerms}
                  onChange={(e) => {
                    setDraft({ ...draft, paymentTerms: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
              <p className="muted full">
                Los documentos ya emitidos conservarán sus datos. Los cambios se aplican a las
                próximas revisiones.
              </p>
              <button className="primary full" disabled={busy}>
                {busy ? 'Guardando…' : creating ? 'Crear y entrar' : 'Guardar identidad'}
              </button>
            </form>
          )}
          {user.platformDeveloper && !creating && (
            <form
              className="formgrid"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await post({
                    action: 'grant',
                    userId: target,
                    role,
                    profile: role === 'worker' ? 'operario:' + worker : undefined,
                  });
                  setError(
                    'Acceso guardado para esta empresa. Puedes ajustar sus permisos desde Equipo.',
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3 className="full">Dar acceso a una cuenta existente</h3>
              <p className="muted full">
                Solo modifica el acceso a {user.workspace?.brand.name}. La contraseña de la cuenta
                se conserva.
              </p>
              <label>
                Cuenta
                <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Selecciona una cuenta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.username}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rol en esta empresa
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="admin">Administrador</option>
                  <option value="commercial">Comercial</option>
                  <option value="worker">Operario</option>
                </select>
              </label>
              {role === 'worker' && (
                <label>
                  Persona del equipo
                  <select required value={worker} onChange={(e) => setWorker(e.target.value)}>
                    <option value="">Selecciona operario</option>
                    {workers
                      .filter((w) => !w.archived)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <button disabled={busy} className="full">
                Guardar acceso
              </button>
            </form>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!dirty || confirm('¿Descartar los cambios de configuración?')) setOpen(false);
            }}
          >
            Cerrar
          </button>
        </FormDialog>
      )}
    </>
  );
}
