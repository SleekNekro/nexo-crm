import { scrypt as derive, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + ((await scrypt(password, salt, 64)) as Buffer).toString('hex');
}
export async function checkPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(':');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, 'hex');
  return expected.length === derived.length && timingSafeEqual(derived, expected);
}
