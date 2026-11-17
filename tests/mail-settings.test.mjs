import test from 'node:test';
import assert from 'node:assert/strict';
import { connection, mailbox, publicIPv4, ionos } from '../src/domain/mail-settings.ts';
test('IONOS y SMTP requieren conexiones TLS conocidas', () => {
  assert.equal(connection(ionos).host, 'smtp.ionos.es');
  assert.equal(connection({ host: 'smtp.example.com', port: 587, security: 'starttls' }).port, 587);
  for (const x of [
    { ...ionos, port: 25 },
    { ...ionos, security: 'none' },
    { ...ionos, host: 'https://smtp.example.com' },
    { ...ionos, host: '127.0.0.1' },
    { ...ionos, host: 'localhost' },
  ])
    assert.throws(() => connection(x));
});
test('SMTP no puede conectar a direcciones internas o especiales', () => {
  for (const ip of [
    '127.0.0.1',
    '10.2.3.4',
    '192.168.1.1',
    '172.16.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '198.18.0.1',
    '192.0.2.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('8.8.8.8'), true);
});
test('Remitente validado, usuario predeterminado y cabeceras protegidas', () => {
  const b = { email: 'persona@example.com', name: 'Persona', password: '', signature: 'Firma' };
  assert.equal(mailbox(b).username, b.email);
  assert.throws(() => mailbox({ ...b, email: 'a@example.com\r\nBcc:x@example.com' }));
  assert.throws(() => mailbox({ ...b, name: 'A\nB' }));
  assert.throws(() => mailbox({ ...b, signature: 'x'.repeat(2001) }));
});
