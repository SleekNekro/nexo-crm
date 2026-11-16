import test from 'node:test';
import assert from 'node:assert/strict';
import { blankBrand, validBrand, contrastText } from '../src/domain/workspace.ts';
import { photoDirectory } from '../src/infrastructure/photo-storage.ts';
import { seed } from '../src/domain/model.ts';
import { quoteDocument } from '../src/presentation/documents/quote-document.ts';
test('marca: rechaza logos remotos, SVG y colores no válidos', () => {
  const b = { ...blankBrand, name: 'Empresa B' };
  assert.equal(validBrand(b), true);
  for (const logo of [
    'https://example.com/logo.png',
    'data:image/svg+xml;base64,abc',
    'javascript:alert(1)',
  ])
    assert.equal(validBrand({ ...b, logo }), false);
  assert.equal(validBrand({ ...b, primary: 'red;display:none' }), false);
  assert.notEqual(contrastText('#ffffff'), contrastText('#000000'));
});
test('documento de otra empresa no hereda identidad fiscal ni cuenta bancaria de NEXO', () => {
  const d = seed().deals[0];
  const v = {
    id: 'revision-b',
    date: '2026-11-12',
    lines: [],
    snapshot: {
      title: 'Oferta B',
      owner: 'Agente B',
      brand: { ...blankBrand, name: 'Empresa B', taxId: 'CIF-B' },
    },
  };
  d.versions = [v];
  const html = quoteDocument(d, v, undefined, undefined, '/brand/nexo-logo.svg');
  assert.ok(html.includes('Empresa B'));
  assert.ok(html.includes('CIF-B'));
  for (const old of ['NEXO', 'Nexo Demo — empresa ficticia', 'Sin validez comercial', '/brand/nexo-logo.svg'])
    assert.ok(!html.includes(old), old);
});
test('fotos: conserva ruta histórica y separa las nuevas empresas', () => {
  const id = 'a'.repeat(32);
  assert.notEqual(photoDirectory(), photoDirectory(id));
  assert.ok(photoDirectory(id).endsWith('/' + id));
  assert.throws(() => photoDirectory('../public'));
});
test('logo de página: conserva el archivo y limita el encuadre a su presentación', () => {
  const brand = {
    ...blankBrand,
    name: 'Lumen',
    logo: 'data:image/jpeg;base64,/9j/2Q==',
    logoLayout: 'page-wordmark',
    detail: '#B99A57',
  };
  assert.equal(validBrand(brand), true);
  assert.equal(validBrand({ ...brand, logoLayout: 'arbitrary-css' }), false);
  assert.equal(validBrand({ ...brand, detail: 'url(evil)' }), false);
  const d = seed().deals[0];
  const v = {
    id: 'logo-revision',
    date: '2026-11-12',
    lines: [],
    snapshot: { title: 'Prueba', owner: 'Prueba', brand },
  };
  d.versions = [v];
  const html = quoteDocument(d, v, undefined, undefined, '');
  assert.ok(html.includes(brand.logo));
  assert.ok(html.includes('translate(-50%,-47%)'));
});
