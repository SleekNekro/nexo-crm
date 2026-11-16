import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base32,
  totp,
  validStep,
  encryptSecret,
  decryptSecret,
  recoveryCodes,
  recoveryHash,
} from '../src/infrastructure/security/totp.ts';
const secret = base32(Buffer.from('12345678901234567890'));
test('TOTP coincide con los vectores SHA1 del RFC 6238', () => {
  for (const [time, code] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])
    assert.equal(totp(secret, Math.floor(time / 30), 8), code);
});
test('TOTP tolera un intervalo, rechaza caducados, códigos incorrectos y reutilización', () => {
  const now = 1234567890000,
    step = Math.floor(now / 30000),
    code = totp(secret, step);
  assert.equal(validStep(secret, code, -1, now), step);
  assert.equal(validStep(secret, code, step, now), null);
  assert.equal(validStep(secret, totp(secret, step - 1), -1, now), step - 1);
  assert.equal(validStep(secret, totp(secret, step - 2), -1, now), null);
  assert.equal(validStep(secret, 'abc', -1, now), null);
});
test('secretos cifrados con autenticidad y códigos de recuperación no reversibles', () => {
  process.env.AUTH_ENCRYPTION_KEY = 'a'.repeat(64);
  const a = encryptSecret(secret),
    b = encryptSecret(secret);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), secret);
  const pieces = a.split(':');
  pieces[1] = '0'.repeat(32);
  assert.throws(() => decryptSecret(pieces.join(':')));
  const { codes, hashes } = recoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.deepEqual(codes.map(recoveryHash), hashes);
  assert.ok(hashes.every((h) => !codes.includes(h)));
  delete process.env.AUTH_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret(secret));
});
