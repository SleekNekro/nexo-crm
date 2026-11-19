import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { quoteDocument } from '../src/presentation/documents/quote-document.ts';
test('documento usa la revisión, escapa datos y desglosa IVA', () => {
  const data = seed(),
    d = data.deals[0];
  const v = {
    id: 'v1',
    date: '2026-11-10',
    lines: [
      { description: 'Partida <especial>', qty: 2, price: 100, discount: 10, tax: 21 },
      { description: 'Segunda', qty: 1, price: 50, discount: 0, tax: 10 },
    ],
  };
  d.versions = [v];
  d.lines = [];
  data.companies[0].name = '<script>cliente</script>';
  const html = quoteDocument(d, v, data.companies[0], data.contacts[0], '/brand/nexo-logo.svg');
  assert.ok(html.includes('&lt;script&gt;cliente&lt;/script&gt;'));
  assert.ok(html.includes('Partida &lt;especial&gt;'));
  assert.ok(html.includes('IVA 10%'));
  assert.ok(html.includes('IVA 21%'));
  assert.ok(html.includes('272,80'));
  assert.ok(html.includes('230,00'));
  assert.ok(html.includes('María Aguirre'));
  assert.ok(html.includes('/brand/nexo-logo.svg'));
});

test('plantilla personalizada: identidad, validez, condiciones y pie quedan en la revisión', async () => {
  const { nexoBrand, validBrand } = await import('../src/domain/workspace.ts');
  const { issueQuote } = await import('../src/domain/actions.ts');
  const data = seed();
  data.deals[0].stage = 'En preparación';
  const next = issueQuote(data, data.deals[0].id, 'custom-template', '2026-11-18');
  const deal = next.deals[0],
    revision = deal.versions[0];
  const brand = {
    ...nexoBrand,
    name: 'Empresa prueba',
    primary: '#126456',
    logo: 'data:image/png;base64,aGVsbG8=',
    quoteValidityDays: '45',
    quoteFooter: '<script>pie</script>',
    paymentTerms: '50 % al aceptar\n50 % a la entrega',
  };
  assert.equal(validBrand(brand), true);
  for (const value of ['0', '366', '-1', '1.5', '30 días', ''])
    assert.equal(validBrand({ ...brand, quoteValidityDays: value }), false);
  revision.snapshot.brand = structuredClone(brand);
  brand.name = 'Cambio posterior';
  const html = quoteDocument(deal, revision, undefined, undefined, '');
  assert.match(html, /Validez del presupuesto: 45 días/);
  assert.match(html, /data:image\/png;base64,aGVsbG8=/);
  assert.match(html, /#126456/);
  assert.match(html, /&lt;script&gt;pie&lt;\/script&gt;/);
  assert.match(html, /50 % al aceptar<br>50 % a la entrega/);
  assert.doesNotMatch(html, /Cambio posterior/);
});

test('caducidad usa los días de la revisión y conserva 30 para documentos históricos', async () => {
  const { quoteState } = await import('../src/domain/commercial-followup.ts');
  const deal = {
    stage: 'En preparación',
    versions: [{ date: '2026-01-01', snapshot: { brand: { quoteValidityDays: '45' } } }],
  };
  assert.equal(quoteState(deal, '2026-02-10'), 'Borrador');
  assert.equal(quoteState(deal, '2026-02-16'), 'Caducado');
  delete deal.versions[0].snapshot;
  assert.equal(quoteState(deal, '2026-02-10'), 'Caducado');
});
