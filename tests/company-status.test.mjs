import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { companyStatus, setCompanyStatus, companyStatuses } from '../src/domain/company-status.ts';
import { validateBusinessChange } from '../src/application/business-rules.ts';
import { salesChanges } from '../src/domain/sales-metrics.ts';
import { applyAuthorized } from '../src/application/access.ts';
test('clasificación inicial reconoce ventas existentes y mantiene estados manuales', () => {
  const d = seed(),
    c = d.companies[0];
  const input = { deals: [], orders: [] };
  assert.equal(companyStatus(c, input), 'Posible cliente');
  input.deals = [{ id: 'sale', companyId: c.id, stage: 'Ganado' }];
  assert.equal(companyStatus(c, input), 'Cliente activo');
  assert.equal(companyStatus({ ...c, status: 'Cliente inactivo' }, input), 'Cliente inactivo');
  input.deals[0].stage = 'En preparación';
  input.orders = [{ dealId: 'sale' }];
  assert.equal(companyStatus(c, input), 'Cliente activo');
});
test('estados válidos se conservan sin modificar tratos, pedidos ni métricas de conversión', () => {
  const d = seed();
  for (const status of companyStatuses) {
    const next = setCompanyStatus(d, d.companies[0].id, status);
    assert.equal(next.companies[0].status, status);
    assert.equal(d.companies[0].status, undefined);
    assert.deepEqual(next.deals, d.deals);
    assert.deepEqual(next.orders, d.orders);
    assert.doesNotThrow(() => validateBusinessChange(d, next));
    assert.equal(salesChanges(d, next, new Set(d.companies.map((c) => c.id))).length, 0);
  }
});
test('estado desconocido se rechaza también en el servidor', () => {
  const d = seed();
  assert.throws(() => setCompanyStatus(d, d.companies[0].id, 'Inventado'));
  const next = structuredClone(d);
  next.companies[0].status = 'Inventado';
  assert.throws(() => validateBusinessChange(d, next), /Estado de empresa/);
});
test('cambiar etiqueta necesita permiso para editar empresas', () => {
  const d = seed(),
    next = setCompanyStatus(d, d.companies[0].id, 'Descartado');
  assert.throws(
    () =>
      applyAuthorized(
        d,
        next,
        {
          id: 'limited',
          username: 'limited',
          role: 'admin',
          profile: 'Dirección',
          mustChange: false,
          permissions: { views: ['Empresas'], actions: [] },
        },
        new Date().toISOString(),
      ),
    /permiso/,
  );
});

import { activateCompaniesOnWin } from '../src/domain/company-status.ts';
import { reconcileCommercialChange } from '../src/application/business-rules.ts';
import { issueQuote, acceptQuote } from '../src/domain/actions.ts';
test('ganar un trato activa la empresa posible desde el servidor, sin editarla manualmente', () => {
  const before = seed();
  const deal = before.deals.find((d) => d.id === 'd1');
  before.companies.find((c) => c.id === deal.companyId).status = 'Posible cliente';
  const input = structuredClone(before);
  input.deals.find((d) => d.id === deal.id).stage = 'Ganado';
  const user = {
    id: 'sales',
    username: 'sales',
    role: 'admin',
    profile: 'Dirección',
    mustChange: false,
    permissions: { views: ['Tratos'], actions: ['deals', 'orders', 'tasks'] },
  };
  const authorized = applyAuthorized(before, input, user, new Date().toISOString());
  let seq = 0;
  const next = reconcileCommercialChange(before, authorized, () => `win-${++seq}`, '2026-11-13');
  assert.equal(next.companies.find((c) => c.id === deal.companyId).status, 'Cliente activo');
  assert.doesNotThrow(() => validateBusinessChange(before, next));
  assert.equal(next.orders.filter((o) => o.dealId === deal.id).length, 1);
  assert.deepEqual(
    reconcileCommercialChange(next, next, () => `repeat-${++seq}`, '2026-11-13'),
    next,
  );
});
test('aceptar presupuesto también activa al posible cliente', () => {
  const before = seed();
  const companyId = before.deals[0].companyId;
  before.companies.find((c) => c.id === companyId).status = 'Posible cliente';
  const issued = issueQuote(before, before.deals[0].id, 'status-quote', '2026-11-13');
  let i = 0;
  const accepted = acceptQuote(
    issued,
    before.deals[0].id,
    'status-quote',
    '2026-11-13',
    () => `status-order-${++i}`,
  );
  const next = reconcileCommercialChange(
    issued,
    accepted,
    () => `status-follow-${++i}`,
    '2026-11-13',
  );
  assert.equal(next.companies.find((c) => c.id === companyId).status, 'Cliente activo');
});
test('no reclasifica por ediciones posteriores ni revierte el cliente al perder otro trato', () => {
  const before = seed();
  before.companies[0].status = 'Cliente inactivo';
  const next = structuredClone(before);
  next.deals[0].stage = 'Ganado';
  assert.equal(activateCompaniesOnWin(before, next).companies[0].status, 'Cliente inactivo');
  const active = structuredClone(next);
  active.companies[0].status = 'Cliente activo';
  const lost = structuredClone(active);
  lost.deals[0].stage = 'Perdido';
  assert.equal(activateCompaniesOnWin(active, lost).companies[0].status, 'Cliente activo');
  const manual = structuredClone(active);
  manual.companies[0].status = 'Posible cliente';
  assert.equal(activateCompaniesOnWin(active, manual).companies[0].status, 'Posible cliente');
});
