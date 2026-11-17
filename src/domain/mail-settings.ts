export type MailConnection = { host: string; port: number; security: 'tls' | 'starttls' };
export type MailProvider = MailConnection & { id: string; name: string };
export const ionos: MailProvider = {
  id: 'ionos',
  name: 'IONOS España',
  host: 'smtp.ionos.es',
  port: 465,
  security: 'tls',
};
export const mailProviderHelp: Record<
  string,
  { text: string; url: string; appPassword?: boolean }
> = {
  gmail: {
    text: 'Activa la verificación en dos pasos y genera una contraseña de aplicación en Google. Usa esa contraseña aquí, no la habitual. Algunas cuentas de empresa no permiten esta opción.',
    url: 'https://support.google.com/accounts/answer/185833?hl=es',
    appPassword: true,
  },
  icloud: {
    text: 'Genera una contraseña específica de aplicación en tu cuenta de Apple. Usa tu dirección completa de iCloud como usuario SMTP.',
    url: 'https://support.apple.com/es-es/102525',
    appPassword: true,
  },
  yahoo: {
    text: 'Genera una contraseña de aplicación en Yahoo y úsala aquí en lugar de tu contraseña habitual.',
    url: 'https://help.yahoo.com/kb/SLN4075.html',
    appPassword: true,
  },
  microsoft365: {
    text: 'Solo cuentas de empresa cuyo administrador permita SMTP AUTH con contraseña. No funciona con Outlook/Hotmail personal ni con organizaciones que exijan OAuth2. La conexión con Microsoft mediante OAuth2 está pendiente.',
    url: 'https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission',
  },
};
export function connection(value: any): MailConnection {
  const host = typeof value?.host === 'string' ? value.host.trim().toLowerCase() : '';
  if (
    host.length > 253 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host)
  )
    throw Error('Indica el nombre del servidor SMTP, sin https:// ni rutas.');
  if (!(
    (value.security === 'tls' && value.port === 465) ||
    (value.security === 'starttls' && value.port === 587)
  ))
    throw Error('Usa SSL/TLS (465) o STARTTLS (587).');
  return { host, port: value.port, security: value.security };
}
export function mailbox(value: any) {
  const email = typeof value?.email === 'string' ? value.email.trim() : '';
  if (email.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email))
    throw Error('Introduce un correo válido.');
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const username =
    typeof value.username === 'string' && value.username.trim() ? value.username.trim() : email;
  const signature = typeof value.signature === 'string' ? value.signature : '';
  if (
    !name ||
    name.length > 120 ||
    /[\r\n]/.test(name) ||
    username.length > 254 ||
    /[\r\n]/.test(username) ||
    signature.length > 2000
  )
    throw Error('Revisa el nombre, usuario o firma.');
  if (typeof value.password !== 'string' || value.password.length > 1024)
    throw Error('Contraseña no válida.');
  return { email, name, username, signature };
}
// Only globally routable IPv4 addresses. IPv6-only SMTP is intentionally unsupported.
export function publicIPv4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
