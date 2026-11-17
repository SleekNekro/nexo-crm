import puppeteer from 'puppeteer-core';
import pg from 'pg';
import assert from 'node:assert/strict';
if (!process.env.DATABASE_URL.endsWith('/crm_auth_check')) throw Error('Only test database');
const p = new pg.Client({ connectionString: process.env.DATABASE_URL });
await p.connect();
const username = (
  await p.query(
    "SELECT username FROM app_users WHERE username LIKE 'fix.%.dev' ORDER BY username DESC LIMIT 1",
  )
).rows[0].username;
await p.end();
const prefix = username.slice(0, -4);
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForSelector('input[name=username]');
  await page.type('input[name=username]', username);
  await page.type('input[name=password]', 'Fixture-only-security-2026!');
  await page.click('form button.primary');
  await page.waitForFunction(() => !document.querySelector('input[name=username]'));
  await page.goto(
    'http://127.0.0.1:3000/documentos/presupuesto?workspace=' +
      (process.env.TEST_WORKSPACE || 'nexo') +
      '&deal=' +
      prefix +
      '.pdf&revision=' +
      prefix +
      '.revision',
  );
  await page.evaluate(() => {
    window.print = () => (window.printChecked = true);
  });
  await page.click('button');
  assert.equal(await page.evaluate(() => window.printChecked), true);
  console.log('PASS quote document: print handler allowed by hash CSP');
} finally {
  await browser.close();
}
