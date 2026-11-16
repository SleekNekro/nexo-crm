import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleData, applyAuthorized } from '../src/application/access.ts';
import { seed } from '../src/domain/model.ts';
import { saveLabor, reviewLabor, workCosts } from '../src/domain/labor.ts';
import {
  hashPassword,
  checkPassword,
  validPassword,
} from '../src/infrastructure/security/password.ts';
const now = '2026-11-11T12:00:00Z';
const worker = {
  id: 'u',
  username: 'worker',
  role: 'worker',
  profile: 'operario:a',
  mustChange: false,
};
const commercial = { ...worker, role: 'commercial', profile: 'Alex' };
const admin = { ...worker, role: 'admin', profile: 'Dirección' };
const setup = () => ({
  ...seed(),
  workers: [
    { id: 'a', name: 'A', kind: 'Propio', company: '', rate: 23 },
    { id: 'b', name: 'B', kind: 'Propio', company: '', rate: 35 },
  ],
  works: [
    {
      id: 'w',
      companyId: 'c1',
      orderId: '',
      name: 'Obra',
      address: '',
      owner: 'Alex',
      responsible: 'Alex',
      workerIds: ['a', 'b'],
      start: '',
      end: '',
      status: 'En curso',
      progress: 0,
      notes: 'privado',
    },
  ],
});
const report = (id = 'r', workerId = 'a') => ({
  id,
  workId: 'w',
  workerId,
  date: '2026-11-11',
  hours: 8,
  summary: 'Trabajo',
  incidents: '',
  photos: [],
  status: 'Borrador',
  rate: null,
  history: [],
  createdAt: '',
  updatedAt: '',
});
test('operario recibe solo sus partes y obras sin tarifas, clientes ni notas privadas', () => {
  let d = saveLabor(setup(), report(), 'a', true, now);
  d = reviewLabor(d, 'r', 'Confirmar', 'Alex', '', now);
  d = saveLabor(d, report('other', 'b'), 'b', true, now);
  const v = visibleData(d, worker);
  assert.equal(v.laborReports.length, 1);
  assert.equal(v.laborReports[0].rate, null);
  assert.equal(v.workers[0].rate, null);
  assert.equal(v.workers.length, 1);
  assert.equal(v.works[0].notes, '');
  assert.equal(v.companies.length, 0);
  assert.equal(v.deals.length, 0);
  assert.equal(v.workExpenses.length, 0);
  assert.deepEqual(applyAuthorized(d, v, worker, now), d);
});
test('operario guarda y envía; servidor genera historial y conserva cartera oculta', () => {
  const d = setup(),
    v = visibleData(d, worker);
  let submitted = saveLabor(v, report(), 'a', true, now);
  submitted.laborReports[0].history = [
    { actor: 'Dirección', action: 'Confirmar', date: now, reason: '' },
  ];
  const n = applyAuthorized(d, submitted, worker, now);
  assert.deepEqual(n.companies, d.companies);
  assert.equal(n.laborReports[0].status, 'Pendiente');
  assert.equal(n.laborReports[0].history[0].actor, 'A');
  assert.equal(n.laborReports[0].history[0].action, 'Enviado');
});
test('operario no confirma, cambia tarifas, modifica obras ni suplanta otro autor', () => {
  const d = setup();
  for (const mutate of [
    (v) => (v.workers[0].rate = 100),
    (v) => v.works[0].workerIds.push('c'),
    (v) => v.laborReports.push({ ...report(), workerId: 'b' }),
    (v) => v.laborReports.push({ ...report(), status: 'Confirmado', rate: 23 }),
    (v) => v.companies.push(d.companies[0]),
  ]) {
    const v = visibleData(d, worker);
    mutate(v);
    assert.throws(() => applyAuthorized(d, v, worker, now));
  }
});
test('fotos referenciadas requieren acceso previo y no se adivinan por hash', () => {
  const d = setup(),
    v = visibleData(d, worker);
  v.laborReports.push({
    ...report(),
    photos: [{ id: 'p', name: 'x', caption: '', src: '/api/photos/' + 'a'.repeat(64) }],
  });
  assert.throws(() => applyAuthorized(d, v, worker, now), /Foto no autorizada/);
});
test('comercial solo accede a su cartera, conserva registros ajenos y no se reasigna permisos', () => {
  const d = setup(),
    v = visibleData(d, commercial);
  assert.ok(v.companies.every((c) => c.owner === 'Alex'));
  v.companies[0].name = 'Cambio';
  const next = applyAuthorized(d, v, commercial, now);
  assert.equal(next.companies[0].name, 'Cambio');
  assert.deepEqual(
    next.companies.find((c) => c.owner === 'Ana'),
    d.companies.find((c) => c.owner === 'Ana'),
  );
  for (const mutate of [
    (v) => v.companies.push(d.companies.find((c) => c.owner === 'Ana')),
    (v) => (v.companies[0].owner = 'Ana'),
    (v) => (v.workers[0].rate = 100),
    (v) => (v.works[0].reviewer = 'Ana'),
  ]) {
    const x = visibleData(d, commercial);
    mutate(x);
    assert.throws(() => applyAuthorized(d, x, commercial, now));
  }
});
test('responsable confirma tarifa del servidor y no altera contenido del parte', () => {
  const d = saveLabor(setup(), report(), 'a', true, now),
    v = visibleData(d, commercial),
    next = reviewLabor(v, 'r', 'Confirmar', 'Alex', '', now);
  const n = applyAuthorized(d, next, commercial, now);
  assert.equal(workCosts(n, 'w').total, 184);
  next.laborReports[0].hours = 20;
  assert.throws(() => applyAuthorized(d, next, commercial, now));
  const wrong = { ...commercial, profile: 'Ana' };
  assert.throws(() => applyAuthorized(d, next, wrong, now));
});
test('dirección configura tarifas; rechaza duplicados y colecciones desconocidas', () => {
  const d = setup(),
    v = visibleData(d, admin);
  v.workers[0].rate = 28;
  assert.equal(applyAuthorized(d, v, admin, now).workers[0].rate, 28);
  v.companies.push(v.companies[0]);
  assert.throws(() => applyAuthorized(d, v, admin, now));
  assert.throws(() => applyAuthorized(d, { ...d, users: [] }, admin, now));
});
test('contraseñas con salt distinto, comprobación y límites', async () => {
  assert.equal(validPassword('corta'), false);
  assert.equal(validPassword('a'.repeat(129)), false);
  const a = await hashPassword('mi-frase-secreta'),
    b = await hashPassword('mi-frase-secreta');
  assert.notEqual(a, b);
  assert.equal(await checkPassword('mi-frase-secreta', a), true);
  assert.equal(await checkPassword('otra-frase-secreta', a), false);
});

test('Obras: administradores ven todas; comercial y revisor solo las asociadas', () => {
  const d = setup();
  d.works.push({
    ...d.works[0],
    id: 'other',
    owner: 'Ana',
    responsible: 'Ana',
    workerIds: [],
    reviewer: 'Comercial1',
  });
  d.siteReports = [{ id: 'private-report', workId: 'other', photos: [] }];
  d.workExpenses = [{ id: 'private-expense', workId: 'other', amount: 50 }];
  assert.equal(visibleData(d, admin).works.length, 2);
  assert.equal(visibleData(d, { ...admin, role: 'developer' }).works.length, 2);
  const own = visibleData(d, commercial);
  assert.deepEqual(
    own.works.map((w) => w.id),
    ['w'],
  );
  assert.deepEqual(own.siteReports, []);
  assert.deepEqual(own.workExpenses, []);
  assert.deepEqual(
    visibleData(d, { ...commercial, profile: 'Comercial1' }).works.map((w) => w.id),
    ['other'],
  );
  own.works.push({ ...d.works[1], owner: 'Alex' });
  assert.throws(() => applyAuthorized(d, own, commercial, now), /autorizado/);
});
