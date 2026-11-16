import type { Metadata, Viewport } from 'next';
import './style.css';
import './controls.css';
export const metadata: Metadata = {
  title: 'NEXO · Comercial',
  description: 'Gestión comercial, equipo y obras',
  applicationName: 'NEXO CRM',
  appleWebApp: { capable: true, title: 'NEXO', statusBarStyle: 'default' },
  icons: { apple: '/app-icons/apple-touch-icon.png', icon: '/app-icons/icon-192.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2563eb',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
