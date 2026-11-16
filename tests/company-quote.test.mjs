import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { createCompanyQuote } from '../src/domain/company-quote.ts';
test('crear presupuesto desde empresa conserva responsable y solo su contacto único', () => {
  const data = seed(),
    c = data.companies[0];
  data.contacts = [
    { id: 'only', companyId: c.id, name: 'Contacto', email: '', phone: '', role: '' },
  ];
  const next = createCompanyQuote(data, c.id, 'new-quote');
  const d = next.deals.at(-1);
  assert.equal(d.companyId, c.id);
  assert.equal(d.owner, c.owner);
  assert.equal(d.contactId, 'only');
  assert.equal(d.stage, 'En preparación');
  assert.deepEqual(d.lines, []);
  assert.deepEqual(d.versions, []);
  assert.equal(next.deals.length, data.deals.length + 1);
  assert.deepEqual(next.orders, data.orders);
  assert.deepEqual(next.works, data.works);
});
test('no elige contactos ambiguos y distingue presupuestos sucesivos', () => {
  let data = seed();
  const id = data.companies[0].id;
  data.contacts = [];
  data = createCompanyQuote(data, id, 'first');
  assert.equal(data.deals.at(-1).contactId, '');
  data.contacts = [1, 2].map((n) => ({
    id: String(n),
    companyId: id,
    name: 'Contacto',
    email: '',
    phone: '',
    role: '',
  }));
  const next = createCompanyQuote(data, id, 'second');
  assert.equal(next.deals.at(-1).contactId, '');
  assert.notEqual(next.deals.at(-1).title, data.deals.at(-1).title);
  assert.throws(() => createCompanyQuote(next, id, 'second'));
  assert.throws(() => createCompanyQuote(next, 'missing', 'third'));
});
