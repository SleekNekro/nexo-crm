const token = process.env.CRM_REMINDER_TOKEN;
if (!token || token.length < 32) throw Error('Falta CRM_REMINDER_TOKEN');
async function tick() {
  try {
    const r = await fetch('http://app:3000/api/internal/activity-reminders', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(55000),
    });
    if (!r.ok) console.error('No se pudieron revisar los recordatorios:', r.status);
    else {
      const b = await r.json();
      if (b.results?.some((r) => r.sent || r.failed || r.unknown))
        console.log(JSON.stringify({ at: new Date().toISOString(), results: b.results }));
    }
  } catch {
    console.error(
      'Servidor no disponible para revisar recordatorios. Se comprobará de nuevo en un minuto.',
    );
  }
}
for (;;) {
  await tick();
  await new Promise((r) => setTimeout(r, 60000));
}
