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
