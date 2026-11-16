import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { removeCompany } from '../src/domain/company-removal.ts';
import { validateBusinessChange } from '../src/application/business-rules.ts';
import { applyAuthorized } from '../src/application/access.ts';
import { quoteState, displayedQuote } from '../src/domain/commercial-followup.ts';
function fixture() {
  const d = seed();
  d.companies.push({ ...d.companies[0], id: 'removable', name: 'Empresa temporal' });
  d.contacts.push({ ...d.contacts[0], id: 'removable-person', companyId: 'removable' });
  return d;
}
test('empresa sin operaciones y contactos se eliminan juntos sin afectar otras empresas', () => {
  const before = fixture(),
    next = removeCompany(before, 'removable');
  assert.equal(next.companies.length, before.companies.length - 1);
  assert.equal(next.contacts.length, before.contacts.length - 1);
  assert.deepEqual(next.deals, before.deals);
  assert.doesNotThrow(() => validateBusinessChange(before, next));
  assert.ok(before.companies.some((c) => c.id === 'removable'));
});
test('servidor impide eliminar empresas con tratos incluso intentando borrar también el trato', () => {
  const before = fixture();
  before.deals.push({
    ...before.deals[0],
    id: 'linked',
    companyId: 'removable',
    contactId: '',
    lines: [],
    versions: [],
  });
  assert.throws(() => removeCompany(before, 'removable'), /historial/);
  const next = structuredClone(before);
  next.companies = next.companies.filter((c) => c.id !== 'removable');
  next.contacts = next.contacts.filter((c) => c.companyId !== 'removable');
  next.deals = next.deals.filter((d) => d.id !== 'linked');
  assert.throws(() => validateBusinessChange(before, next), /historial/);
});
test('empresa con obra queda protegida y contacto huérfano bloquea borrado', () => {
  const d = fixture();
  d.works = [{ id: 'existing-work', companyId: 'removable' }];
  assert.throws(() => removeCompany(d, 'removable'), /historial/);
  const before = fixture(),
    after = structuredClone(before);
  after.companies = after.companies.filter((c) => c.id !== 'removable');
  assert.throws(() => validateBusinessChange(before, after), /contactos/);
});
test('el permiso de empresas se exige también para eliminar', () => {
  const d = fixture(),
    next = removeCompany(d, 'removable');
  const u = {
    id: 'limited',
    username: 'limited',
    role: 'admin',
    profile: 'Dirección',
    mustChange: false,
    permissions: { views: ['Empresas'], actions: [] },
  };
  assert.throws(() => applyAuthorized(d, next, u, new Date().toISOString()), /permiso/);
});
test('lista de presupuestos muestra el documento aceptado aunque exista otra revisión o cambie el borrador', () => {
  const d = structuredClone(seed().deals[0]);
  d.lines = [{ ...d.lines[0], price: 999 }];
  d.versions = [
    { id: 'first', date: '2026-11-01', lines: [{ ...d.lines[0], price: 10 }] },
    { id: 'last', date: '2026-11-02', lines: [{ ...d.lines[0], price: 20 }] },
  ];
  d.acceptedRevisionId = 'first';
  assert.equal(displayedQuote(d).revision.id, 'first');
  assert.equal(displayedQuote(d).lines[0].price, 10);
  assert.equal(quoteState(d), 'Aceptado');
  delete d.acceptedRevisionId;
  d.stage = 'En preparación';
  assert.equal(displayedQuote(d).revision.id, 'last');
  d.stage = 'Perdido';
  assert.equal(quoteState(d), 'Perdido');
});
