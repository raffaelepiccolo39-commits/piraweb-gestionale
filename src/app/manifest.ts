import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PiraWeb Gestionale',
    short_name: 'PiraWeb',
    description: 'Gestionale interno PiraWeb - Gestione clienti, progetti e team',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/logo.png',
        sizes: '200x94',
        type: 'image/png',
      },
    ],
  };
}
