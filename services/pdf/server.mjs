import http from 'node:http';
import { mkdir, unlink, chmod } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const socket = '/run/crm-pdf/render.sock';
await mkdir('/run/crm-pdf', { recursive: true });
await unlink(socket).catch((e) => {
  if (e.code !== 'ENOENT') throw e;
});
let busy = false;
const server = http.createServer(async (req, res) => {
  const fail = (status) => {
    if (!res.headersSent) {
      res.writeHead(status);
      res.end();
    } else res.destroy();
  };
  if (req.method !== 'POST' || req.url !== '/render') return fail(404);
  if (busy) return fail(429);
  if (req.headers['content-type'] !== 'text/html; charset=utf-8') return fail(415);
  busy = true;
  let browser;
  let size = 0;
  const chunks = [];
  const timer = setTimeout(() => {
    fail(408);
    req.destroy();
  }, 10000);
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        fail(413);
        return;
      }
      chunks.push(chunk);
    }
    clearTimeout(timer);
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
      timeout: 20000,
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(r.url())) void r.continue();
      else void r.abort();
    });
    await page.setContent(Buffer.concat(chunks).toString('utf8'), {
      waitUntil: 'load',
      timeout: 15000,
    });
    const pdf = Buffer.from(
      await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        timeout: 15000,
      }),
    );
    if (pdf.length > 10 * 1024 * 1024) return fail(413);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length });
    res.end(pdf);
  } catch {
    fail(503);
  } finally {
    clearTimeout(timer);
    try {
      if (browser) {
        const stop = setTimeout(() => browser.process()?.kill('SIGKILL'), 5000);
        try {
          await browser.close();
        } finally {
          clearTimeout(stop);
        }
      }
    } finally {
      busy = false;
    }
  }
});
server.requestTimeout = 12000;
server.headersTimeout = 10000;
server.listen(socket, () => void chmod(socket, 0o600));
