// Optional browser check, against the same disposable fixture as the integration suite.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
assert.equal(new URL(process.env.DATABASE_URL || '').pathname, '/nexo_modules_check');
const base = process.env.CRM_TEST_URL || 'http://127.0.0.1:8189';
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(base, { waitUntil: 'networkidle2' });
  await page.type('input[name=username]', 'developer');
  await page.type('input[name=password]', process.env.CRM_TEST_PASSWORD);
  await page.click('form button.primary');
  await page
    .waitForFunction(() => document.body.textContent.includes('Crear y gestionar módulos'), {
      timeout: 60000,
    })
    .catch(async (e) => {
      console.log('Fixture UI state:', await page.evaluate(() => document.body.innerText));
      throw e;
    });
  async function click(text) {
    await page.waitForFunction(
      (text) => [...document.querySelectorAll('button')].some((e) => e.textContent.trim() === text),
      { polling: 100 },
      text,
    );
    await page.evaluate((text) => {
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.reverse().find((e) => e.textContent.trim() === text);
      if (!button) throw Error('Missing ' + text);
      button.click();
    }, text);
  }
  await page.click('.mobile-menu-toggle');
  await click('Crear y gestionar módulos');
  await page.waitForSelector('[aria-label="Mis módulos"]');
  await click('Crear módulo');
  await page.waitForSelector('.custom-module-builder');
  await click('Usar plantilla Equipos');
  await click('Continuar');
  await click('Continuar');
  await click('Publicar módulo');
  await page.waitForSelector('.custom-module-panel');
  await click('Añadir registro');
  await page.waitForSelector('.custom-record-editor form');
  const inputs = await page.$$('.custom-record-editor input');
  await inputs[0].type('Equipo UI de prueba');
  await inputs[1].type('UI-001');
  const selects = await page.$$('.custom-record-editor select');
  await selects.at(-1).select('Pendiente');
  await click('Guardar registro');
  await page.waitForSelector('.custom-record-card');
  assert.match(
    await page.$eval('.custom-record-card', (e) => e.textContent),
    /Equipo UI de prueba/,
  );
  await page.click('.custom-record-card');
  await page.waitForSelector('.custom-record-editor');
  await click('Editar registro');
  await page.waitForSelector('.custom-record-editor form');
  const title = await page.$('.custom-record-editor input');
  await title.click({ clickCount: 3 });
  await title.type('Equipo UI editado');
  await click('Guardar registro');
  await page.waitForFunction(() => !document.querySelector('.custom-record-editor'));
  assert.match(await page.$eval('.custom-record-card', (e) => e.textContent), /editado/);
  await page.screenshot({ path: '/tmp/nexo-modules-mobile.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.click('.custom-record-card');
  await page.waitForSelector('.custom-record-editor');
  page.once('dialog', (d) => d.accept());
  await click('Eliminar registro');
  await page.waitForFunction(() => !document.querySelector('.custom-record-card'));
  await click('Volver');
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
  console.log(
    'Custom module UI OK: mobile builder, publish, create, read, edit, delete, back, scroll restoration.',
  );
} finally {
  await browser.close();
}
