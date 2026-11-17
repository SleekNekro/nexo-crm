import puppeteer from 'puppeteer-core';
import pg from 'pg';
import assert from 'node:assert/strict';
if (!process.env.DATABASE_URL.endsWith('/crm_auth_check')) throw Error('Only test database');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const username = (
  await db.query(
    "SELECT username FROM app_users WHERE username LIKE 'fix.%.dev' ORDER BY username DESC LIMIT 1",
  )
).rows[0].username;
await db.end();
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    window.violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.violations.push({ directive: e.effectiveDirective, blocked: e.blockedURI }),
    );
  });
  const response = await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle0' });
  assert.match(response.headers()['content-security-policy'], /nonce-/);
  await page.waitForSelector('input[name=username]');
  await page.type('input[name=username]', username);
  await page.type('input[name=password]', 'Fixture-only-security-2026!');
  await page.click('form button.primary');
  await page.waitForFunction(() => !document.querySelector('input[name=username]'), {
    timeout: 15000,
  });
  const legitimate = await page.evaluate(() => window.violations);
  assert.deepEqual(legitimate, []);
  assert.deepEqual(errors, []);
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.isNavigationRequest() && request.url().includes('?injection=1')) {
      const original = await fetch('http://127.0.0.1:3000/');
      const headers = Object.fromEntries(original.headers);
      delete headers['content-length'];
      delete headers['content-encoding'];
      delete headers['transfer-encoding'];
      const html = (await original.text()).replace(
        '<body>',
        '<body><script>window.injectedSecurityTest=true</script>',
      );
      await request.respond({ status: 200, headers, body: html });
    } else await request.continue();
  });
  await page.goto('http://127.0.0.1:3000/?injection=1', { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => window.injectedSecurityTest), undefined);
  assert.ok(
    (await page.evaluate(() => window.violations)).some((v) => v.directive === 'script-src-elem'),
  );
  console.log(
    'PASS browser: login/hydration work without CSP violations; parser-injected inline script blocked',
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
