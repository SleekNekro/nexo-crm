import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
const url = new URL(process.argv[2] || 'http://localhost:8180');
const allowLocalHttp = process.argv.includes('--local-http');
const h = url.hostname;
const octets = h.split('.').map(Number);
const ipv4 = octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
const local =
  h === 'localhost' ||
  (ipv4 &&
    (octets[0] === 127 ||
      octets[0] === 10 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)));
if (
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== '/' ||
  !(url.protocol === 'https:' || (allowLocalHttp && local && url.protocol === 'http:'))
) {
  throw Error('Usa HTTPS, o HTTP local con --local-http. No incluyas credenciales ni rutas.');
}
const configRoot =
  process.platform === 'darwin'
    ? path.join(homedir(), 'Library/Application Support')
    : process.platform === 'win32'
      ? process.env.APPDATA
      : path.join(homedir(), '.config');
if (!configRoot) throw Error('No se pudo localizar la carpeta de configuración');
const dir = path.join(configRoot, 'com.nexo.crm');
await mkdir(dir, { recursive: true });
await writeFile(
  path.join(dir, 'server.json'),
  JSON.stringify({ url: url.href, allowLocalHttp }, null, 2) + '\n',
  { mode: 0o600 },
);
console.log('Servidor configurado. Cierra y vuelve a abrir NEXO CRM.');
