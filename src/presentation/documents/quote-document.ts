import { nexoBrand } from '../../domain/workspace.ts';
import type { Company, Contact, Deal } from '../../domain/model';
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const number = (n: number) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function quoteDocument(
  deal: Deal,
  revision: Deal['versions'][number],
  client: Company | undefined,
  contact: Contact | undefined,
  logoUrl: string,
) {
  if (revision.snapshot) {
    deal = { ...deal, title: revision.snapshot.title, owner: revision.snapshot.owner };
    client = revision.snapshot.client;
    contact = revision.snapshot.contact;
  }
  const brand = revision.snapshot?.brand || nexoBrand;
  const euro = (n: number) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: brand.currency || 'EUR',
      minimumFractionDigits: 2,
    }).format(n);

  logoUrl = brand.logo === '/brand/nexo-logo.svg' ? logoUrl : brand.logo;
  const logo = logoUrl
    ? brand.logoLayout === 'page-wordmark'
      ? `<span style="display:block;position:relative;overflow:hidden;width:35mm;height:9.72mm"><img src="${escape(logoUrl)}" alt="${escape(brand.name)}" style="position:absolute;width:172%;max-width:none;height:auto;left:50%;top:50%;transform:translate(-50%,-47%)"></span>`
      : `<img src="${escape(logoUrl)}" alt="${escape(brand.name)}">`
    : `<strong>${escape(brand.name)}</strong>`;
  const index = deal.versions.findIndex((v) => v.id === revision.id) + 1;
  const rows = revision.lines.map((l) => {
    const base = round(l.qty * l.price * (1 - l.discount / 100));
    return { ...l, base, vat: round((base * l.tax) / 100) };
  });
  const base = round(rows.reduce((s, l) => s + l.base, 0)),
    vat = round(rows.reduce((s, l) => s + l.vat, 0));
  const taxes = new Map<number, number>();
  rows.forEach((l) => taxes.set(l.tax, round((taxes.get(l.tax) || 0) + l.vat)));
  const line = (value: string | undefined) => (value ? `<p>${escape(value)}</p>` : '');
  const city =
    [client?.postalCode, client?.city].filter(Boolean).join(' - ') +
    (client?.province ? ' (' + client.province + ')' : '');
  const date = new Date(revision.date).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Presupuesto ${escape(revision.number || 'R' + index)} - ${escape(deal.title)}</title><style>
 *{box-sizing:border-box}body{margin:0;background:#eee;color:#000;font:10.5pt/1.22 Arial,Helvetica,sans-serif}button{font:inherit;cursor:pointer}.toolbar{padding:14px 20px;text-align:center;background:${escape(brand.primary)};color:#fff;font-size:13px}.toolbar button{margin-left:16px;border:0;border-radius:4px;background:${escape(brand.primary)};color:#fff;padding:10px 18px}.sheet{width:210mm;min-height:297mm;margin:20px auto;padding:17mm 17.5mm;background:#fff}.letterhead{height:26mm;position:relative}.letterhead img{display:block;width:35mm;height:auto}.letterhead h1{position:absolute;top:12mm;left:0;width:100%;text-align:center;font-weight:400;font-size:22pt;margin:0}.parties{display:table;width:100%;table-layout:fixed;margin-top:1mm}.supplier,.customer{display:table-cell;vertical-align:top}.supplier{width:65%}.customer{width:35%}.parties p{margin:0 0 2.2mm;overflow-wrap:anywhere}.commercial{margin-top:1mm;margin-bottom:7mm}.reference{display:table;width:100%;table-layout:fixed;break-inside:avoid}.reference .subject{display:table-cell;width:65%;padding-right:10mm;white-space:pre-wrap;overflow-wrap:anywhere}.reference .metadata{display:table-cell;vertical-align:top;width:35%;font-size:13pt}.metadata p{margin:0 0 3.5mm;display:flex;justify-content:space-between;gap:8px}.metadata p span:last-child{min-width:0;overflow-wrap:anywhere;text-align:right}.metadata .revision{font-size:9pt;color:#555}.contact{font-size:10pt;margin-top:3mm;white-space:normal}.items{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:19mm;font-size:10.5pt}.items thead{display:table-header-group}.items th{font-weight:400;text-align:right;padding:2.5mm 1mm 4mm}.items th:first-child{width:44%;text-align:left}.items th:nth-child(2){width:10%}.items th:nth-child(3){width:16%}.items th:nth-child(4){width:12%}.items th:last-child{width:18%}.items td{padding:0 1mm 4mm;text-align:right;vertical-align:top;break-inside:avoid}.items td:first-child{white-space:pre-wrap;text-align:left;overflow-wrap:anywhere}.items td:not(:first-child){white-space:nowrap;font-variant-numeric:tabular-nums}.items tr{break-inside:avoid}.taxnote{display:block;font-size:8pt;color:#555;margin-top:1mm}.closing{break-inside:avoid}.validity{margin:2mm 0 4mm}.totals{width:65mm;margin-left:auto;border-collapse:collapse}.totals td{padding:1mm 0;text-align:right}.totals td:last-child{width:30mm}.conditions{margin-top:1mm}.conditions h2{font-size:10.5pt;font-weight:400;margin:0 0 5mm}.conditions p{margin:0;line-height:1.15}.signatures{display:flex;justify-content:space-between;margin-top:11mm;min-height:22mm}.historical{font-size:8pt;color:#666;margin-top:4mm}@page{size:A4;margin:17mm 17.5mm}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;padding:0;min-height:0;width:auto}.items thead{display:table-header-group}.items{margin-top:19mm}.closing{break-inside:avoid}}@media screen and (max-width:800px){body{overflow-x:auto}.sheet{margin:0 auto}.toolbar{min-width:210mm}}
 </style></head><body><div class="toolbar">Presupuesto ${escape(brand.name)} · Revisión ${index}<button onclick="window.print()">Imprimir / Guardar PDF</button></div><main class="sheet"><header class="letterhead">${logo}<h1>Presupuesto</h1></header><section class="parties"><div class="supplier">${line(brand.legalName || brand.name)}${line(brand.taxId)}${brand.address.split('\n').map(line).join('')}${line(brand.phone)}${line(brand.email)}${line(brand.website)}</div><div class="customer">${line(client?.name || 'Cliente no disponible')}${line(client?.taxId)}${line(client?.address)}${line(city)}${line(client?.phone ? 'Tef: ' + client.phone : undefined)}${line(client?.email)}</div></section><p class="commercial">Comercial: ${escape(deal.owner)}</p><section class="reference"><div class="subject">${escape(deal.title)}${contact ? `<div class="contact">A la atención de: ${escape(contact.name)}${contact.email ? '<br>' + escape(contact.email) : ''}${contact.phone ? '<br>' + escape(contact.phone) : ''}</div>` : ''}</div><div class="metadata"><p><span>Nº PRESUPUESTO:</span><span>${escape(revision.number || 'Sin referencia')}</span></p><p><span>Fecha:</span><span>${escape(date)}</span></p>${index > 1 ? `<p class="revision">Revisión ${index}</p>` : ''}</div></section><table class="items" aria-label="Detalle de partidas"><thead><tr><th>Concepto</th><th>Cant</th><th>Precio</th><th>Dto %</th><th>Total</th></tr></thead><tbody>${rows.map((l) => `<tr><td>${escape(l.description)}${taxes.size > 1 ? `<span class="taxnote">IVA ${number(l.tax)}%</span>` : ''}</td><td>${number(l.qty)}${l.unit ? ' ' + escape(l.unit) : ''}</td><td>${euro(l.price)}</td><td>${l.discount ? number(l.discount) : ''}</td><td>${euro(l.base)}</td></tr>`).join('')}</tbody></table><section class="closing"><p class="validity">Validez del presupuesto: 30 días</p><table class="totals" aria-label="Totales del presupuesto"><tbody><tr><td>Subtotal</td><td>${euro(base)}</td></tr>${[
   ...taxes,
 ]
   .sort(([a], [b]) => a - b)
   .map(([rate, amount]) => `<tr><td>IVA ${number(rate)}%</td><td>${euro(amount)}</td></tr>`)
   .join(
     '',
   )}<tr><td>Total Presupuesto</td><td>${euro(round(base + vat))}</td></tr></tbody></table><section class="conditions"><h2>Condiciones:</h2><p>${escape(brand.paymentTerms).replace(/\n/g, '<br>')}</p></section><div class="signatures"><span>Conforme</span><span>Conforme ${escape(brand.legalName || brand.name)}</span></div></section>${!revision.snapshot ? '<p class="historical">Revisión histórica: los datos identificativos del cliente corresponden a su ficha actual.</p>' : ''}</main></body></html>`;
}
