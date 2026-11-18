/** Read locally; only the selected, validated rows are sent to the CRM. Never evaluate formulas. */
export async function readSpreadsheet(bytes: ArrayBuffer) {
  if (bytes.byteLength > 1_000_000) throw Error('Máximo 1 MB por archivo Excel');
  const { unzipSync } = await import('fflate');
  let expanded = 0;
  unzipSync(new Uint8Array(bytes), {
    filter: (entry) => {
      expanded += entry.originalSize;
      if (entry.originalSize > 8_000_000 || expanded > 16_000_000)
        throw Error('El Excel descomprimido es demasiado grande');
      return false;
    },
  });
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  if (book.worksheets.length > 20) throw Error('Máximo 20 hojas por libro');
  return book.worksheets
    .filter((s) => s.state === 'visible' && s.actualRowCount)
    .map((sheet) => {
      if (sheet.rowCount > 1001 || sheet.columnCount > 30)
        throw Error(`«${sheet.name}»: máximo 1.000 filas y 30 columnas`);
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const values: string[] = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const cell = row.getCell(i);
          if (cell.type === ExcelJS.ValueType.Formula)
            throw Error(
              `«${sheet.name}»: sustituye las fórmulas por sus valores antes de importar`,
            );
          const text =
            cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text;
          if (text.length > 500) throw Error('Hay una celda con más de 500 caracteres');
          values.push(text);
        }
        rows.push(values);
      });
      const csv = rows
        .map((r) => r.map((v) => '"' + v.replaceAll('"', '""') + '"').join(';'))
        .join('\n');
      if (csv.length > 1_000_000) throw Error('El contenido de la hoja supera 1 MB');
      return { name: sheet.name, csv };
    });
}
