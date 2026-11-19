import { isolatedPdf } from './isolated-pdf';
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { quoteDocument } from './quote-document.ts';
import type { Company, Contact, Deal } from '../../domain/model';
let generating = false;
export async function quotePdf(
  deal: Deal,
  revision: Deal['versions'][number],
  company?: Company,
  contact?: Contact,
) {
  if (generating) throw Error('PDF ocupado. Vuelve a intentarlo en unos segundos.');
  generating = true;
  try {
    const logo =
      'data:image/svg+xml;base64,' +
      (await readFile(path.join(process.cwd(), 'public/brand/nexo-logo.svg'))).toString('base64');
    const html = quoteDocument(deal, revision, company, contact, logo);
    if (Buffer.byteLength(html, 'utf8') > 4 * 1024 * 1024)
      throw Error('Documento demasiado grande');
    if (process.env.CRM_PDF_SOCKET) return await isolatedPdf(html);
    if (process.env.NODE_ENV === 'production') throw Error('Configura el renderizador PDF aislado');
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
      timeout: 20000,
    });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(request.url()))
          void request.continue();
        else void request.abort();
      });
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: 15000,
      });
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.images, (image) => image.decode()));
      });
      const pdf = Buffer.from(
        await page.pdf({
          format: 'A4',
          preferCSSPageSize: true,
          printBackground: true,
          timeout: 15000,
        }),
      );
      if (pdf.length > 10 * 1024 * 1024) throw Error('PDF demasiado grande');
      return pdf;
    } finally {
      await browser.close();
    }
  } finally {
    generating = false;
  }
}
