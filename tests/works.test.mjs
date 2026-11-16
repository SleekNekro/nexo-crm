import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { saveWork, saveSiteReport, validSiteData, validData } from '../src/domain/actions.ts';
import { mergeIndependent } from '../src/domain/merge.ts';
const work = {
  id: 'w1',
  companyId: 'c1',
  orderId: '',
  name: 'Obra de prueba',
  address: 'Bilbao',
  owner: 'Alex',
  responsible: 'Encargado',
  start: '2026-11-11',
  end: '2026-11-20',
  status: 'En curso',
  progress: 20,
  notes: '',
};
const report = {
  id: 'r1',
  workId: 'w1',
  date: '2026-11-11',
  author: 'Encargado',
  summary: 'Preparación',
  materials: '',
  incidents: '',
  crew: [
    { id: 'a', kind: 'Propio', name: 'Equipo', people: 2, hours: 8 },
    { id: 'b', kind: 'Subcontrata', name: 'Empresa', people: 1, hours: 4 },
  ],
  photos: [{ id: 'p', name: 'Prueba.jpg', caption: 'Detalle', src: 'data:image/jpeg;base64,/9j/' }],
  createdAt: '2026-11-11',
  updatedAt: '2026-11-11',
};
test('alta de obra y parte mixto con fotos conserva los datos comerciales', () => {
  const base = seed(),
    next = saveSiteReport(saveWork(base, work), report);
  assert.ok(validData(next));
  assert.deepEqual(next.deals, base.deals);
  assert.equal(
    next.siteReports[0].crew.reduce((s, c) => s + c.people * c.hours, 0),
    20,
  );
  assert.equal(next.siteReports[0].photos[0].caption, 'Detalle');
  assert.equal(base.works, undefined);
});
test('editar parte actualiza sin duplicar y conserva fotos', () => {
  let d = saveSiteReport(saveWork(seed(), work), report);
  d = saveSiteReport(d, { ...report, summary: 'Preparación terminada' });
  assert.equal(d.siteReports.length, 1);
  assert.equal(d.siteReports[0].summary, 'Preparación terminada');
  assert.equal(d.siteReports[0].photos.length, 1);
});
test('validación rechaza fechas invertidas, vínculos ajenos y partes sin obra', () => {
  assert.throws(() => saveWork(seed(), { ...work, end: '2026-11-01' }));
  assert.throws(() => saveWork(seed(), { ...work, orderId: 'p1' }));
  assert.throws(() => saveSiteReport(seed(), report));
  assert.throws(() => saveWork(seed(), { ...work, start: '2026-02-30' }));
  assert.ok(validSiteData(seed()));
});
test('rechaza horas inválidas, demasiadas fotos y formatos no permitidos', () => {
  const d = saveWork(seed(), work);
  assert.throws(() => saveSiteReport(d, { ...report, crew: [{ ...report.crew[0], hours: 25 }] }));
  assert.throws(() => saveSiteReport(d, { ...report, photos: Array(9).fill(report.photos[0]) }));
  assert.throws(() =>
    saveSiteReport(d, {
      ...report,
      photos: [{ ...report.photos[0], src: 'data:image/svg+xml;base64,AAAA' }],
    }),
  );
});
test('concurrencia combina un parte nuevo con cambios comerciales', () => {
  const base = saveWork(seed(), work),
    local = saveSiteReport(base, report),
    remote = structuredClone(base);
  remote.companies[0].city = 'Vitoria';
  const result = mergeIndependent(base, local, remote);
  assert.equal(result.siteReports.length, 1);
  assert.equal(result.companies[0].city, 'Vitoria');
  assert.equal(result.siteReports[0].photos.length, 1);
});
