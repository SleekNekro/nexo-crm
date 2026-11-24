import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../apps/desktop/web/setup.js', import.meta.url), 'utf8');
const status = {
  docker: true,
  hasAccount: true,
  ready: true,
  running: true,
  url: 'http://localhost:8280',
  message: 'Listo',
};
async function setup(responses = {}) {
  const nodes = new Map();
  const calls = [];
  const el = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        id,
        hidden: false,
        disabled: false,
        textContent: '',
        value: '',
        classList: { toggle() {} },
        setAttribute() {},
      });
    return nodes.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: el, querySelectorAll: () => [...nodes.values()] },
    window: {
      __TAURI_INTERNALS__: {
        invoke: async (_, { action }) => {
          calls.push(action);
          const value = responses[action];
          if (value instanceof Error) throw value;
          return (
            value ??
            (action === 'status'
              ? status
              : {
                  client: '0.2.0-beta.5',
                  server: {
                    current: '0.2.0-beta.4',
                    target: '0.2.0-beta.4',
                    available: false,
                    recovery: false,
                  },
                })
          );
        },
      },
    },
    confirm: () => true,
  });
  vm.runInContext('globalThis.receiveProgress = (...a)=>window.receiveProgress(...a);', context);
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    el,
    calls,
    run: (action) => vm.runInContext(`perform(${JSON.stringify(action)})`, context),
  };
}
test('desktop updater never silently installs on normal startup', async () => {
  const { el, calls } = await setup();
  assert.deepEqual(calls, ['status', 'updates-status']);
  assert.equal(el('update-install').hidden, true);
  assert.equal(el('update-recover').hidden, true);
});
test('interrupted server offers recovery and hides start/update', async () => {
  const { el } = await setup({
    'updates-status': {
      client: 'test',
      server: { current: 'old', available: true, recovery: true },
    },
  });
  assert.equal(el('update-recover').hidden, false);
  assert.equal(el('update-install').hidden, true);
  assert.equal(el('start').hidden, true);
});
test('update errors remain visible after refreshing versions', async () => {
  const { el, run } = await setup({ 'updates-install': new Error('Firma no válida') });
  await run('updates-install');
  assert.match(el('error').textContent, /Firma no válida/);
  assert.equal(el('update-check').disabled, false);
});
test('only a pending approved restart resumes the local server', async () => {
  const { calls } = await setup({
    'updates-status': {
      client: 'test',
      resume: true,
      server: { current: 'old', available: true, recovery: false },
    },
    'server-update': status,
  });
  assert.equal(calls.filter((x) => x === 'server-update').length, 1);
});
test('remote client can see an app update without a local server', async () => {
  const { el, run } = await setup({
    'updates-check': {
      client: 'old',
      next: 'new',
      server: { current: 'Sin instalar', available: false, recovery: false },
    },
  });
  await run('updates-check');
  assert.equal(el('update-install').hidden, false);
  assert.match(el('update-message').textContent, /new/);
});
