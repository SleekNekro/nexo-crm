import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'NEXO CRM',
    short_name: 'NEXO',
    description: 'Comercial, equipo y obras',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf9f6',
    theme_color: '#2563eb',
    icons: [192, 512].map((size) => ({
      src: `/app-icons/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
  };
}
