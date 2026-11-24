const el = (id) => document.getElementById(id);
let state = null,
  busy = false,
  updates = null;
function render() {
  el('status').textContent = state?.message || 'Comprobando Docker…';
  el('led').classList.toggle('ready', !!state?.ready);
  el('docker-help').hidden = !state || state.docker;
  el('account').hidden = !!state?.hasAccount;
  el('start').textContent = state?.hasAccount ? 'Iniciar servidor' : 'Preparar mi CRM';
  el('start').hidden = !!state?.ready;
  el('start').disabled = busy || !state?.docker;
  el('stop').hidden = !state?.running;
  el('open').hidden = !state?.ready;
  el('address').textContent = state?.url ? `Dirección local: ${state.url}` : '';
  el('update-install').hidden =
    !(updates?.next || updates?.server?.available) || !!updates?.server?.recovery;
  el('update-recover').hidden = !updates?.server?.recovery;
  el('versions').textContent = updates
    ? `Aplicación: ${updates.client} · Servidor local: ${updates.server.current}`
    : 'Consultando las versiones instaladas…';
  el('start').hidden = !!state?.ready || !!updates?.server?.recovery;
  document.querySelectorAll('button,input').forEach((x) => {
    if (x.id !== 'start') x.disabled = busy;
  });
}
window.receiveProgress = (message) => {
  el('progress').hidden = false;
  el('progress').textContent = message;
};
async function perform(action, extra = {}) {
  if (busy) return;
  busy = true;
  el('error').textContent = '';
  render();
  receiveProgress(
    action === 'status'
      ? 'Comprobando el servidor…'
      : action === 'stop'
        ? 'Deteniendo sin borrar tus datos…'
        : 'Preparando…',
  );
  try {
    const result = await window.__TAURI_INTERNALS__.invoke('setup_action', {
      action,
      password: null,
      url: null,
      allowLocalHttp: null,
      ...extra,
    });
    if (action.startsWith('updates-')) {
      if (action === 'updates-install') {
        if (result.state) state = result.state;
        el('update-message').textContent = 'Nexo está actualizado.';
      } else {
        updates = result;
        el('update-message').textContent = result.server.recovery
          ? 'Una actualización se interrumpió. Pulsa Recuperar servidor.'
          : result.next
            ? `Disponible: ${result.next}. Se actualizarán la aplicación y después su servidor local.`
            : result.server.available
              ? `Servidor ${result.server.target} disponible.`
              : action === 'updates-check'
                ? 'Ya tienes la última versión disponible.'
                : '';
      }
    } else if (!result.opened) state = result;
  } catch (error) {
    el('error').textContent = String(error);
  } finally {
    busy = false;
    el('progress').hidden = true;
    render();
  }
  if (['updates-install', 'server-update', 'server-recover', 'start'].includes(action)) {
    const error = el('error').textContent,
      message = el('update-message').textContent;
    await perform('updates-status');
    if (error) el('error').textContent = error;
    else if (!updates?.server?.available && !updates?.server?.recovery)
      el('update-message').textContent = message || 'Nexo está actualizado.';
  }
}
for (const mode of ['local', 'remote'])
  el(`${mode}-tab`).onclick = () => {
    for (const value of ['local', 'remote']) {
      el(`${value}-panel`).hidden = value !== mode;
      el(`${value}-tab`).setAttribute('aria-selected', String(value === mode));
    }
  };
el('install').onsubmit = (event) => {
  event.preventDefault();
  const password = el('password').value;
  if (
    !state?.hasAccount &&
    (password.length < 8 || password.length > 128 || password !== el('repeat').value)
  ) {
    el('error').textContent = 'Escribe la misma contraseña de 8 a 128 caracteres en ambos campos.';
    return;
  }
  el('password').value = '';
  el('repeat').value = '';
  perform('start', { password });
};
el('connect').onsubmit = (event) => {
  event.preventDefault();
  perform('connect', { url: el('server').value.trim(), allowLocalHttp: el('http').checked });
};
el('docker-download').onclick = () => perform('docker-download');
el('check').onclick = () => perform('status');
el('open').onclick = () => perform('open-local');
let pendingAction = null;
function askBefore(action, message) {
  if (busy) return;
  pendingAction = action;
  el('confirmation-message').textContent = message;
  el('confirmation').hidden = false;
  el('confirmation').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  el('confirm-action').focus?.();
}
el('cancel-action').onclick = () => {
  pendingAction = null;
  el('confirmation').hidden = true;
};
el('confirm-action').onclick = () => {
  const action = pendingAction;
  pendingAction = null;
  el('confirmation').hidden = true;
  if (action) void perform(action);
};
el('stop').onclick = () =>
  askBefore(
    'stop',
    '¿Detener el servidor? Se cerrarán las conexiones a este Nexo. Tus datos se conservarán.',
  );
el('update-check').onclick = () => perform('updates-check');
el('update-install').onclick = () =>
  askBefore(
    'updates-install',
    'Guarda tus cambios y cierra las ventanas del CRM. Haremos una copia de seguridad y pausaremos el servidor. La aplicación puede reiniciarse para continuar.',
  );
el('update-recover').onclick = () => perform('server-recover');
async function initialize() {
  await perform('status');
  await perform('updates-status');
  if (updates?.resume) await perform(updates.server.recovery ? 'server-recover' : 'server-update');
}
initialize();
