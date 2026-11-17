import { createHash } from 'node:crypto';
export function appCsp(nonce: string, development = false) {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${development ? ' ws: wss:' : ''}; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
}
export function documentCsp() {
  const hashes = ['window.print()', "location.href='/__native/print'"]
    .map((code) => "'sha256-" + createHash('sha256').update(code).digest('base64') + "'")
    .join(' ');
  return `default-src 'none'; script-src 'unsafe-hashes' ${hashes}; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
}
