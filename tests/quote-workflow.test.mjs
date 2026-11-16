import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { issueQuote } from '../src/domain/actions.ts';
import { matchingDraftRevision, suggestedFollowUp } from '../src/domain/quote-workflow.ts';
import { nexoBrand } from '../src/domain/workspace.ts';
test('reutiliza revisión sin cambios y exige otra cuando cambia un importe o datos del documento', () => {
  const initial = seed();
  initial.deals[0].contactId = initial.contacts[0].id;
  const d = issueQuote(initial, 'd1', 'flow-test', '2026-11-13');
  const deal = d.deals.find((x) => x.id === 'd1');
  deal.versions[0].snapshot.brand = structuredClone(nexoBrand);
  assert.equal(matchingDraftRevision(d, deal, nexoBrand).id, 'flow-test');
  const changes = [
    (x) => x.deals[0].lines[0].price++,
    (x) => (x.companies[0].name = 'Nombre corregido'),
    (x) => (x.deals[0].title = 'Nuevo título'),
    (x) => (x.contacts[0].email = 'nuevo@example.test'),
  ];
  for (const change of changes) {
    const other = structuredClone(d);
    change(other);
    assert.equal(matchingDraftRevision(other, other.deals[0], nexoBrand), undefined);
  }
  assert.equal(matchingDraftRevision(d, deal, { ...nexoBrand, name: 'Otra empresa' }), undefined);
  assert.equal(deal.versions.length, 1);
});
test('cambiar clasificación comercial no obliga a regenerar un PDF sin cambios fiscales', () => {
  const d = issueQuote(seed(), 'd1', 'same-doc', '2026-11-13');
  d.companies[0].status = 'Cliente activo';
  assert.ok(matchingDraftRevision(d, d.deals[0], nexoBrand));
});
test('no reutiliza una revisión antigua sin snapshot ni una revisión anterior si la última difiere', () => {
  const d = issueQuote(seed(), 'd1', 'first', '2026-11-13');
  const deal = d.deals[0];
  deal.versions.push({
    ...structuredClone(deal.versions[0]),
    id: 'second',
    lines: [{ ...deal.lines[0], price: 999 }],
  });
  assert.equal(matchingDraftRevision(d, deal, nexoBrand), undefined);
  delete deal.versions[1].snapshot;
  assert.equal(matchingDraftRevision(d, deal, nexoBrand), undefined);
});
test('seguimiento propuesto a tres días laborables cruza fines de semana y cambio de año', () => {
  assert.equal(suggestedFollowUp('2026-11-13'), '2026-11-18');
  assert.equal(suggestedFollowUp('2026-11-16'), '2026-11-19');
  assert.equal(suggestedFollowUp('2026-12-31'), '2027-01-05');
});
