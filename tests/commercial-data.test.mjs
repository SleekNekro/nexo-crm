import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  suggestColumns,
  previewImport,
  applyImport,
} from '../src/domain/commercial-import.ts';
import { mergeCommercial } from '../src/domain/commercial-merge.ts';
import { seed } from '../src/domain/model.ts';
import { validateBusinessChange } from '../src/application/business-rules.ts';
const empty = () => ({ companies: [], contacts: [], deals: [], orders: [], tasks: [], notes: [] });
test('CSV: BOM, separador español, comillas, saltos de línea y ceros iniciales', () => {
  const p = parseCsv(
    '\uFEFFNombre;Teléfono;Dirección\r\n"Obras; Norte";001234567;"Calle \"\"Uno\"\"\nLocal 2"\r\n',
  );
  assert.deepEqual(p.rows, [['Obras; Norte', '001234567', 'Calle "Uno"\nLocal 2']]);
  assert.deepEqual(parseCsv('Nombre,Correo\nAna,a@example.com').rows, [['Ana', 'a@example.com']]);
  assert.deepEqual(parseCsv('Nombre\tCorreo\nAna\ta@example.com').rows, [['Ana', 'a@example.com']]);
});
test('CSV rechaza cabeceras repetidas, límites y comillas sin cerrar', () => {
  for (const s of ['Nombre;Nombre\na;b', 'Nombre\n"no cierra', 'Nombre\n' + 'a\n'.repeat(1001)])
    assert.throws(() => parseCsv(s));
  assert.throws(() => parseCsv('a'.repeat(1_000_001)));
});
test('importación detecta duplicados existentes y dentro del archivo sin sobrescribir', () => {
  const d = empty();
  d.companies = [
    { id: 'c', name: 'Original', taxId: 'B-123', phone: '+34 612 345 678', email: 'A@EXAMPLE.COM' },
  ];
  const csv =
    'Nombre;CIF;Correo;Teléfono\nOtra;B123;;\nNueva;B999;n@example.com;\nNueva 2;B999;;\nDistinta;;;612345678\nCorreo;;a@example.com;';
  const rows = previewImport(
    d,
    csv,
    'companies',
    suggestColumns(parseCsv(csv).headers, 'companies'),
    'demo',
  );
  assert.deepEqual(
    rows.map((r) => r.duplicates.length > 0),
    [true, false, true, true, true],
  );
  assert.throws(() => applyImport(d, rows, [2], () => 'new'));
  const n = applyImport(d, rows, [3], () => 'new');
  assert.equal(n.companies.length, 2);
  assert.deepEqual(n.companies[0], d.companies[0]);
  assert.equal(
    previewImport(
      n,
      csv,
      'companies',
      suggestColumns(parseCsv(csv).headers, 'companies'),
      'demo',
    )[1].duplicates.length,
    1,
  );
});
test('importación valida filas y selección manipulada', () => {
  const csv = 'Nombre;Correo\n;a@example.com\nAna;no-es-correo\nCorrecta;c@example.com';
  const rows = previewImport(empty(), csv, 'companies', { name: 0, email: 1 }, 'demo');
  assert.ok(rows[0].error);
  assert.ok(rows[1].error);
  assert.equal(rows[2].error, '');
  assert.throws(() => applyImport(empty(), rows, [9], () => 'x'));
  assert.throws(() => applyImport(empty(), rows, [4, 4], () => 'x'));
  assert.throws(() => previewImport(empty(), csv, 'companies', { name: 0, email: 0 }, 'demo'));
});
test('contactos resuelven empresa única por CIF, no adivinan con nombres repetidos', () => {
  const d = empty();
  d.companies = [
    { id: 'a', name: 'Empresa', taxId: 'B1' },
    { id: 'b', name: 'Empresa', taxId: 'B2' },
  ];
  const csv = 'Nombre;Empresa;Correo\nAna;B1;ana@example.com\nLuis;Empresa;\nEva;Inexistente;';
  const rows = previewImport(d, csv, 'contacts', { name: 0, company: 1, email: 2 }, '');
  assert.equal(rows[0].record.companyId, 'a');
  assert.ok(rows[1].error);
  assert.ok(rows[2].error);
  assert.equal(applyImport(d, rows, [2], () => 'ct').contacts[0].companyId, 'a');
});
function mergeFixture() {
  const d = seed();
  const deal = d.deals[0];
  deal.contactId = d.contacts[0].id;
  deal.versions = [
    {
      id: 'v1',
      date: '2026-10-01',
      lines: structuredClone(deal.lines),
      snapshot: {
        title: deal.title,
        owner: deal.owner,
        client: structuredClone(d.companies[0]),
        contact: structuredClone(d.contacts[0]),
      },
    },
  ];
  d.works = [
    {
      id: 'w',
      companyId: 'c1',
      orderId: '',
      name: 'Obra',
      owner: 'Demo',
      responsible: 'Demo',
      address: '',
      start: '',
      end: '',
      status: 'En curso',
      progress: 0,
      notes: '',
    },
  ];
  return d;
}
test('fusión de empresa conserva documentos emitidos, IDs, actividades, notas, pedidos y obras', () => {
  const d = mergeFixture(),
    original = structuredClone(d);
  const p = mergeCommercial(d, 'companies', 'c1', 'c2', { name: 'source' });
  assert.equal(
    p.next.companies.some((c) => c.id === 'c1'),
    false,
  );
  assert.equal(p.next.companies.find((c) => c.id === 'c2').name, d.companies[0].name);
  assert.equal(p.next.deals[0].companyId, 'c2');
  assert.equal(p.next.contacts[0].companyId, 'c2');
  assert.equal(p.next.works[0].companyId, 'c2');
  assert.deepEqual(p.next.deals[0].versions, d.deals[0].versions);
  for (const k of ['tasks', 'notes', 'orders']) assert.deepEqual(p.next[k], d[k]);
  assert.deepEqual(d, original);
  validateBusinessChange(p.next, p.next);
  assert.throws(() => validateBusinessChange(d, p.next), /historial/); // ordinary edits cannot bypass merge
});
test('revisiones antiguas sin snapshot conservan el cliente anterior al fusionar', () => {
  const d = mergeFixture();
  delete d.deals[0].versions[0].snapshot;
  const n = mergeCommercial(d, 'companies', 'c1', 'c2').next;
  assert.equal(n.deals[0].versions[0].snapshot.client.id, 'c1');
  assert.equal(n.deals[0].versions[0].snapshot.contact.id, d.contacts[0].id);
});
test('fusión de contactos mueve referencias vivas sin cambiar el PDF histórico', () => {
  const d = mergeFixture();
  d.contacts.push({ ...d.contacts[0], id: 'duplicate', email: 'other@example.com' });
  const n = mergeCommercial(d, 'contacts', d.contacts[0].id, 'duplicate').next;
  assert.equal(n.deals[0].contactId, 'duplicate');
  assert.equal(n.deals[0].versions[0].snapshot.contact.id, d.contacts[0].id);
  assert.deepEqual(n.tasks, d.tasks);
  assert.throws(
    () => mergeCommercial(d, 'contacts', d.contacts[0].id, d.contacts[1].id),
    /misma empresa/,
  );
});
test('fusión protege identidad, campos y estado activo; completa vacíos sin perder originales', () => {
  const d = mergeFixture();
  d.companies[0].status = 'Cliente activo';
  d.companies[0].phone = '123';
  d.companies[1].phone = '';
  const p = mergeCommercial(d, 'companies', 'c1', 'c2');
  assert.equal(p.result.status, 'Cliente activo');
  assert.equal(p.result.phone, '123');
  assert.equal(p.source.id, 'c1');
  assert.throws(() => mergeCommercial(d, 'companies', 'c1', 'c1'));
  assert.throws(() => mergeCommercial(d, 'companies', 'missing', 'c2'));
  assert.throws(() => mergeCommercial(d, 'companies', 'c1', 'c2', { id: 'source' }));
});
