'use client';
import { useIdentity } from '../components/permission-controls';
import { settingsOrDefault, moduleEnabled } from '../../domain/business-settings';
export function useBusinessSettings() {
  return settingsOrDefault(useIdentity()?.workspace?.settings);
}
export function useModule(view: string) {
  return moduleEnabled(useIdentity()?.workspace?.settings, view);
}
export function useMoney() {
  const currency = useIdentity()?.workspace?.brand.currency || 'EUR';
  return (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
}
