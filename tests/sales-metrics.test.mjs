import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { salesChanges, commercialAnalysis } from '../src/domain/sales-metrics.ts';
test('primer ganado activa una vez; ganar dos tratos del mismo cliente no duplica activación', () => {
  const d = seed(),
    n = structuredClone(d);
  n.deals[0].stage = 'Ganado';
  n.deals.push({ ...n.deals[0], id: 'd-new' });
  const e = salesChanges(d, n, new Set(['c3']));
  assert.equal(e.filter((x) => x.kind === 'client_activated').length, 1);
  assert.equal(e.find((x) => x.kind === 'client_activated').owner, 'Alex');
  assert.equal(e.filter((x) => x.kind === 'stage_changed' && x.toStage === 'Ganado').length, 2);
  assert.equal(salesChanges(n, n, new Set(['c1', 'c3'])).length, 0);
});
test('reabrir y volver a ganar no activa al cliente otra vez ni duplica cierres en el periodo', () => {
  const d = seed(),
    n = structuredClone(d);
  n.deals[0].stage = 'Ganado';
  const first = salesChanges(d, n, new Set(['c3']));
  const reopened = structuredClone(n);
  reopened.deals[0].stage = 'En preparación';
  const reopenedEvents = salesChanges(n, reopened, new Set(['c1', 'c3']));
  const last = salesChanges(reopened, n, new Set(['c1', 'c3']));
  assert.equal(last.filter((e) => e.kind === 'client_activated').length, 0);
  const r = commercialAnalysis(
    n,
    [...first, ...reopenedEvents, ...last],
    [
      { company_id: 'c1', active: true },
      { company_id: 'c3', active: true },
    ],
    '2026-11-11',
  ).find((r) => r.owner === 'Alex');
  assert.equal(r.won, 1);
  assert.equal(r.activated, 1);
  assert.equal(r.winRate, 100);
});
test('sin eventos no inventa fechas históricas; situación actual sigue visible', () => {
  const d = seed(),
    rows = commercialAnalysis(d, [], [{ company_id: 'c3', active: true }], '2026-11-11'),
    ana = rows.find((r) => r.owner === 'Ana');
  assert.equal(ana.currentWon, 1);
  assert.equal(ana.active, 1);
  assert.equal(ana.won, 0);
  assert.equal(ana.activated, 0);
  assert.equal(ana.winRate, null);
});
test('atribución histórica no cambia al reasignar la cartera', () => {
  const d = seed(),
    n = structuredClone(d);
  n.deals[0].stage = 'Ganado';
  const events = salesChanges(d, n, new Set(['c3']));
  n.deals[0].owner = 'Ana';
  n.companies[0].owner = 'Ana';
  const rows = commercialAnalysis(n, events, [{ company_id: 'c1', active: true }], '2026-11-11');
  assert.equal(rows.find((r) => r.owner === 'Alex').won, 1);
  assert.equal(rows.find((r) => r.owner === 'Ana').won, 0);
});
