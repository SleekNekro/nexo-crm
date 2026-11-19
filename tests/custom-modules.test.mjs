import test from 'node:test';
import assert from 'node:assert/strict';
import {
  equipmentTemplate,
  validateModule,
  validateModuleRecord,
  validateModuleChange,
  canUseModule,
} from '../src/domain/custom-modules.ts';
const record = () => ({
  id: 'r',
  title: 'Equipo demo',
  version: 1,
  values: { serie: 'DEMO-01', estado: 'Pendiente' },
});
test('Equipos plantilla válida y derechos explícitos por perfil', () => {
  const m = equipmentTemplate();
  validateModule(m);
  assert.ok(canUseModule(m, 'admin', 'delete'));
  assert.ok(canUseModule(m, 'commercial', 'edit'));
  assert.equal(canUseModule(m, 'commercial', 'delete'), false);
  assert.equal(canUseModule(m, 'worker', 'read'), false);
  m.enabled = false;
  assert.equal(canUseModule(m, 'developer', 'read'), false);
});
test('rechaza identificadores inseguros, campos duplicados y permisos incompletos', () => {
  for (const id of ['__proto__', 'constructor', 'x;drop table', '']) {
    const m = equipmentTemplate();
    m.fields[0].id = id;
    assert.throws(() => validateModule(m));
  }
  const m = equipmentTemplate();
  m.fields.push(m.fields[0]);
  assert.throws(() => validateModule(m));
  const p = equipmentTemplate();
  p.permissions.worker = ['edit'];
  assert.throws(() => validateModule(p));
});
test('validación de registros: requeridos, números, fechas y opciones', () => {
  const m = equipmentTemplate();
  validateModuleRecord(m, 'Demo', record().values);
  assert.throws(() => validateModuleRecord(m, 'Demo', {}));
  assert.throws(() => validateModuleRecord(m, 'Demo', { ...record().values, estado: 'Otro' }));
  assert.throws(() =>
    validateModuleRecord(m, 'Demo', { ...record().values, revision: '2026-02-30' }),
  );
  assert.throws(() => validateModuleRecord(m, 'Demo', { ...record().values, extra: 'x' }));
  m.fields.push({
    id: 'coste',
    label: 'Coste',
    type: 'money',
    required: false,
    archived: false,
    options: [],
  });
  assert.throws(() => validateModuleRecord(m, 'Demo', { ...record().values, coste: Infinity }));
  validateModuleRecord(m, 'Demo', { ...record().values, coste: 12.5 });
});
test('conserva campos y opciones usados; permite archivar y desactivar sin borrar', () => {
  const before = equipmentTemplate();
  const next = structuredClone(before);
  next.fields[0].type = 'number';
  assert.throws(() => validateModuleChange(before, next, [record()]));
  next.fields[0].type = 'text';
  next.fields[0].archived = true;
  next.enabled = false;
  validateModuleChange(before, next, [record()]);
  next.fields = next.fields.filter((f) => f.id !== 'serie');
  assert.throws(() => validateModuleChange(before, next, [record()]));
  const options = structuredClone(before);
  options.fields.find((f) => f.id === 'estado').options = ['Terminado'];
  assert.throws(() => validateModuleChange(before, options, [record()]));
});
test('campos obligatorios nuevos no invalidan registros existentes silenciosamente', () => {
  const before = equipmentTemplate(),
    next = structuredClone(before);
  next.fields.find((f) => f.id === 'cliente').required = true;
  assert.throws(() => validateModuleChange(before, next, [record()]));
  next.fields.find((f) => f.id === 'cliente').required = false;
  validateModuleChange(before, next, [record()]);
});
