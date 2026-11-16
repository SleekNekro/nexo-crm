import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../src/domain/model.ts';
import { issueQuote, markQuoteSent, editActivityData, validLines } from '../src/domain/actions.ts';
import {
  finishCommercialActivity,
  nextCommercialStep,
  daysFrom,
} from '../src/domain/commercial-workflow.ts';
import { revisionFollowUp } from '../src/domain/quote-workflow.ts';
import { businessToday } from '../src/domain/commercial-followup.ts';
const today = businessToday();
function sent() {
  return markQuoteSent(
    issueQuote(seed(), 'd1', 'v1', today),
    'd1',
    'v1',
    today + 'T12:00:00Z',
    daysFrom(today, 1),
    () => 'follow1',
  );
}
test('el presupuesto muestra la fecha actual al reprogramar y al completar con otro seguimiento', () => {
  let d = sent();
  d = editActivityData(d, 'follow1', { title: 'Llamar', due: daysFrom(today, 5), kind: 'Llamada' });
  assert.equal(revisionFollowUp(d, 'd1', 'v1').due, daysFrom(today, 5));
  d = finishCommercialActivity(d, 'follow1', 'Solicita otra llamada', {
    id: 'follow2',
    title: 'Volver a llamar',
    due: daysFrom(today, 7),
  });
  assert.equal(revisionFollowUp(d, 'd1', 'v1').due, daysFrom(today, 7));
  d = finishCommercialActivity(d, 'follow2', 'Cliente informado', undefined);
  assert.equal(revisionFollowUp(d, 'd1', 'v1').state, 'completed');
});
test('enviar una revisión nueva sustituye solo los seguimientos anteriores de presupuesto', () => {
  let d = sent();
  d.tasks.push({
    id: 'visit',
    dealId: 'd1',
    owner: d.deals[0].owner,
    title: 'Visita técnica',
    due: today,
    kind: 'Visita',
    done: false,
  });
  d = issueQuote(d, 'd1', 'v2', today);
  d = markQuoteSent(d, 'd1', 'v2', today + 'T12:00:00Z', daysFrom(today, 2), () => 'follow2');
  assert.ok(d.tasks.find((t) => t.id === 'follow1').cancelled);
  assert.equal(d.tasks.find((t) => t.id === 'visit').cancelled, undefined);
  assert.equal(d.tasks.filter((t) => t.quoteRevisionId && !t.cancelled && !t.done).length, 1);
  assert.equal(
    markQuoteSent(d, 'd1', 'v2', today + 'T12:00:00Z', today, () => 'duplicate').tasks.length,
    d.tasks.length,
  );
});
test('un borrador modificado no sugiere enviar el documento anterior', () => {
  const d = sent();
  d.deals[0].lines[0].price++;
  assert.equal(nextCommercialStep(d.deals[0], []).label, 'Revisar cambios del presupuesto');
});
test('rechaza partidas vacías y fechas inexistentes al programar el siguiente paso', () => {
  const d = sent();
  assert.equal(validLines([{ ...d.deals[0].lines[0], description: '   ' }]), false);
  assert.throws(() =>
    finishCommercialActivity(d, 'follow1', '', { id: 'next', title: 'Llamar', due: '2099-02-30' }),
  );
});
