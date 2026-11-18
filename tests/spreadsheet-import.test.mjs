import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readSpreadsheet } from '../src/presentation/utils/read-spreadsheet.ts';
import { parseCsv } from '../src/domain/commercial-import.ts';
const bytes = async (book) => {
  const b = await book.xlsx.writeBuffer();
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
test('Excel preserves multiple visible sheets, quoted text and text phone numbers', async () => {
  const b = new ExcelJS.Workbook();
  b.addWorksheet('Empresas').addRows([
    ['Nombre', 'Teléfono'],
    ['Prueba; Uno', '001234'],
  ]);
  b.addWorksheet('Contactos').addRows([
    ['Nombre', 'Empresa'],
    ['Ana', 'Prueba; Uno'],
  ]);
  const sheets = await readSpreadsheet(await bytes(b));
  assert.equal(sheets.length, 2);
  assert.deepEqual(parseCsv(sheets[0].csv).rows, [['Prueba; Uno', '001234']]);
});
test('Excel rejects formulas and oversized input rather than evaluating them', async () => {
  const b = new ExcelJS.Workbook();
  b.addWorksheet('Datos').addRows([
    ['Nombre'],
    [{ formula: 'HYPERLINK("https://example.com","x")', result: 'x' }],
  ]);
  await assert.rejects(readSpreadsheet(await bytes(b)), /fórmulas/);
  await assert.rejects(readSpreadsheet(new ArrayBuffer(1000001)), /1 MB/);
});
