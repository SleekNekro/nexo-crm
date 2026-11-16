import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer) {
  let bits = 0,
    value = 0,
    out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode(secret: string) {
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const c of secret.toUpperCase().replace(/=+$/, '')) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw Error('Secreto no válido');
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(out);
}
export function totp(secret: string, step: number, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function validStep(secret: string, code: unknown, last = -1, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const candidate of [step, step - 1, step + 1])
    if (
      candidate > last &&
      timingSafeEqual(Buffer.from(totp(secret, candidate)), Buffer.from(code))
    )
      return candidate;
  return null;
}
function key() {
  const k = Buffer.from(process.env.AUTH_ENCRYPTION_KEY || '', 'hex');
  if (k.length !== 32) throw Error('Falta la clave de cifrado de autenticación');
  return k;
}
export function encryptSecret(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  const bytes = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map((b) => b.toString('hex')).join(':');
}
export function decryptSecret(value: string) {
  const [iv, tag, bytes] = value.split(':').map((x) => Buffer.from(x, 'hex')),
    cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAuthTag(tag);
  return cipher.update(bytes).toString('utf8') + cipher.final().toString('utf8');
}
export const newSecret = () => base32(randomBytes(20));
export const recoveryHash = (code: string) =>
  createHash('sha256').update(code.replace(/[-\s]/g, '').toLowerCase()).digest('hex');
export function recoveryCodes() {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(12).toString('hex').match(/.{4}/g)!.join('-'),
  );
  return { codes, hashes: codes.map(recoveryHash) };
}
