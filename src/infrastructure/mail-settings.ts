import nodemailer from 'nodemailer';
import { Resolver } from 'node:dns/promises';
import { connection, publicIPv4, type MailConnection } from '../domain/mail-settings.ts';
export const mailSchema = `
CREATE TABLE IF NOT EXISTS crm_mail_providers(id text PRIMARY KEY,name text NOT NULL,host text NOT NULL,port integer NOT NULL,security text NOT NULL);
INSERT INTO crm_mail_providers VALUES('ionos','IONOS España','smtp.ionos.es',465,'tls') ON CONFLICT DO NOTHING;
INSERT INTO crm_mail_providers VALUES
('gmail','Gmail / Google Workspace','smtp.gmail.com',465,'tls'),
('icloud','iCloud Mail','smtp.mail.me.com',587,'starttls'),
('yahoo','Yahoo Mail','smtp.mail.yahoo.com',465,'tls'),
('microsoft365','Microsoft 365 · SMTP autorizado','smtp.office365.com',587,'starttls')
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS crm_mail_preferences(id boolean PRIMARY KEY DEFAULT true CHECK(id),provider_id text NOT NULL);
CREATE SEQUENCE IF NOT EXISTS crm_mail_version;
CREATE TABLE IF NOT EXISTS crm_mail_accounts(user_id text PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,provider_id text NOT NULL,email text NOT NULL,name text NOT NULL,username text NOT NULL,signature text NOT NULL,host text NOT NULL,port integer NOT NULL,security text NOT NULL,secret text NOT NULL,version integer NOT NULL DEFAULT 1,verified_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE crm_mail_accounts ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true;
`;
export async function smtpTransport(
  settings: MailConnection & { username: string },
  password: string,
) {
  const cfg = connection(settings);
  const resolver = new Resolver({ timeout: 4000, tries: 1 });
  const addresses = await resolver.resolve4(cfg.host);
  if (!addresses.length || addresses.some((ip) => !publicIPv4(ip)))
    throw Error('Destino SMTP no permitido');
  // Pin the checked address; TLS still validates the original hostname.
  const transport = nodemailer.createTransport({
    host: addresses[0],
    port: cfg.port,
    secure: cfg.security === 'tls',
    requireTLS: true,
    tls: { servername: cfg.host, minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: settings.username, pass: password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
}

export async function verifyMailbox(
  settings: MailConnection & { username: string },
  password: string,
) {
  const transport = await smtpTransport(settings, password);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
