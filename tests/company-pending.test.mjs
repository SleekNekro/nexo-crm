import test from 'node:test';
import assert from 'node:assert/strict';
import { companyPending } from '../src/domain/company-pending.ts';
const line = { description: 'Producto', qty: 1, price: 10, tax: 21, discount: 0 };
const deal = (id, extra = {}) => ({
  id,
  companyId: 'c1',
  title: id,
  owner: 'Ana',
  stage: 'En preparación',
  lines: [line],
  versions: [],
  ...extra,
});
const task = (id, extra = {}) => ({
  id,
  dealId: 'd1',
  title: id,
  owner: 'Ana',
  due: '2026-11-17',
  done: false,
  kind: 'Llamada',
  ...extra,
});
test('Pendientes de empresa: vencidas, hoy y completadas sin mezclar otras empresas', () => {
  const p = companyPending(
    [deal('d1')],
    [
      task('a'),
      task('b', { due: '2026-11-16' }),
      task('c', { done: true }),
      task('d', { cancelled: 'Cancelada' }),
      task('e', { dealId: 'otro' }),
    ],
    '2026-11-17',
  );
  assert.equal(p.activities, 2);
  assert.equal(p.overdue, 1);
  assert.equal(p.today, 1);
});
test('Un presupuesto por trato: última revisión, excluyendo aceptados, perdidos y tratos vacíos', () => {
  const revision = { id: 'r1', date: '2026-11-17', lines: [line], sentAt: '2026-11-17T10:00:00Z' };
  const p = companyPending(
    [
      deal('d1', { versions: [revision, { ...revision, id: 'r2' }] }),
      deal('d2'),
      deal('d3', { stage: 'Ganado' }),
      deal('d4', { stage: 'Perdido' }),
      deal('d5', { lines: [] }),
      deal('d6', { acceptedRevisionId: 'r1', versions: [revision] }),
    ],
    [],
    '2026-11-17',
  );
  assert.equal(p.quotes, 2);
  assert.equal(p.waiting, 1);
  assert.equal(p.drafts, 1);
});
test('Una revisión caducada necesita atención y no se cuenta dos veces', () => {
  const p = companyPending(
    [
      deal('d1', {
        versions: [{ id: 'r1', date: '2026-09-01', lines: [line], sentAt: '2026-09-02T10:00:00Z' }],
      }),
    ],
    [],
    '2026-11-17',
  );
  assert.equal(p.expired, 1);
  assert.equal(p.waiting, 0);
  assert.equal(p.quotes, 1);
});
