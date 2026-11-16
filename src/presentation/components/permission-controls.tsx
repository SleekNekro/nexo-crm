'use client';
import {
  createContext,
  useContext,
  type ButtonHTMLAttributes,
  type SelectHTMLAttributes,
  type InputHTMLAttributes,
  type FormHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import type { Identity } from '../../application/access';
import { canAct } from '../../domain/permissions';
const Context = createContext<Identity | null>(null);
export function PermissionProvider({
  user,
  children,
}: {
  user: Identity | null;
  children: ReactNode;
}) {
  return <Context.Provider value={user}>{children}</Context.Provider>;
}
export function useCanAction(action: string) {
  const user = useContext(Context);
  return !user || action.split(',').every((a) => canAct(user, a));
}
export function PermissionButton({
  action,
  disabled,
  title,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { action: string }) {
  const allowed = useCanAction(action);
  return (
    <button
      {...props}
      disabled={disabled || !allowed}
      title={!allowed ? 'Tu cuenta no tiene permiso para esta acción' : title}
    />
  );
}
export function PermissionSelect({
  action,
  disabled,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { action: string }) {
  const allowed = useCanAction(action);
  return (
    <select
      {...props}
      disabled={disabled || !allowed}
      title={!allowed ? 'Tu cuenta no tiene permiso para esta acción' : props.title}
    />
  );
}
export function PermissionInput({
  action,
  disabled,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { action: string }) {
  const allowed = useCanAction(action);
  return (
    <input
      {...props}
      disabled={disabled || !allowed}
      title={!allowed ? 'Tu cuenta no tiene permiso para esta acción' : props.title}
    />
  );
}
export function PermissionForm({
  action,
  onSubmit,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { action: string; ref?: Ref<HTMLFormElement> }) {
  const allowed = useCanAction(action);
  return (
    <form
      {...props}
      onSubmit={(e) => {
        if (!allowed) {
          e.preventDefault();
          return;
        }
        onSubmit?.(e);
      }}
    >
      {!allowed && (
        <p className="muted">
          Solo lectura: esta cuenta no puede guardar cambios en este formulario.
        </p>
      )}
      {children}
    </form>
  );
}
