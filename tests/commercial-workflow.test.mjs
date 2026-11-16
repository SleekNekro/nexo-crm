import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import {
  nextCommercialStep,
  finishCommercialActivity,
  daysFrom,
} from '../src/domain/commercial-workflow.ts';
import { businessToday } from '../src/domain/commercial-followup.ts';
test('siguiente paso distingue preparar, revisar, registrar envío, seguir y cerrado', () => {
  const d = { ...seed().deals[0], stage: 'En preparación', lines: [], versions: [] };
  assert.equal(nextCommercialStep(d, []).label, 'Preparar presupuesto');
  d.lines = seed().deals[0].lines;
  assert.equal(nextCommercialStep(d, []).label, 'Revisar y abrir PDF');
  d.versions = [{ id: 'v', date: businessToday(), lines: d.lines }];
  assert.equal(nextCommercialStep(d, []).label, 'Registrar envío');
  d.versions[0].sentAt = businessToday();
  assert.equal(nextCommercialStep(d, []).kind, 'schedule');
  d.stage = 'Ganado';
  assert.equal(nextCommercialStep(d, []).kind, 'open');
});
test('actividad vencida tiene acceso directo y no se sugieren canceladas ni hechas', () => {
  const d = seed().deals[0],
    t = {
      id: 't',
      dealId: d.id,
      title: 'Llamar',
      due: '2000-01-01',
      owner: d.owner,
      kind: 'Llamada',
      done: false,
    };
  assert.equal(nextCommercialStep(d, [t]).task.id, 't');
  assert.equal(nextCommercialStep(d, [{ ...t, done: true }]).task, undefined);
  assert.equal(nextCommercialStep(d, [{ ...t, cancelled: 'Cerrada' }]).task, undefined);
});
test('completa y programa atómicamente, conserva responsable y guarda resultado', () => {
  const d = seed(),
    deal = d.deals[0];
  deal.stage = 'En preparación';
  d.tasks = [
    {
      id: 't',
      dealId: deal.id,
      title: 'Llamar',
      due: businessToday(),
      owner: deal.owner,
      kind: 'Llamada',
      done: false,
    },
  ];
  const n = finishCommercialActivity(d, 't', '  Pide otra muestra  ', {
    id: 'next',
    title: 'Enviar muestra',
    due: daysFrom(businessToday(), 3),
  });
  assert.equal(d.tasks[0].done, false);
  assert.equal(n.tasks[0].done, true);
  assert.equal(n.tasks[0].result, 'Pide otra muestra');
  assert.equal(n.tasks[1].owner, deal.owner);
  assert.equal(n.tasks[1].kind, 'Seguimiento');
  assert.equal(n.tasks[1].dealId, deal.id);
  assert.throws(() => finishCommercialActivity(n, 't', '', undefined));
  assert.throws(() =>
    finishCommercialActivity(d, 't', '', { id: 'next', title: '', due: businessToday() }),
  );
  deal.stage = 'Perdido';
  assert.throws(() =>
    finishCommercialActivity(d, 't', '', { id: 'next', title: 'Llamar', due: businessToday() }),
  );
});
test('fechas rápidas cruzan mes y año', () => {
  assert.equal(daysFrom('2026-12-31', 1), '2027-01-01');
});
