'use client';
import type { ReactNode } from 'react';
import { useIdentity } from './permission-controls';
import { canView } from '../../domain/permissions';
export function useViewAccess() {
  const user = useIdentity();
  return (name: string) => !user || canView(user, name);
}
export default function Module({ name, children }: { name: string; children: ReactNode }) {
  return useViewAccess()(name) ? children : null;
}
