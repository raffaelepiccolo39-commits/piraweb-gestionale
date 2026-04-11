import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PiraWeb Gestionale',
    short_name: 'PiraWeb',
    description: 'Gestionale interno PiraWeb - Gestione clienti, progetti e team',
    start_url: '/dashboard',
    scope: '/dashboard',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0a0a0a',
    theme_color: '#4F46E5',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/logo.png',
        sizes: '200x94',
        type: 'image/png',
      },
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        url: '/dashboard',
      },
      {
        name: 'Task',
        url: '/tasks',
      },
      {
        name: 'Chat',
        url: '/chat',
      },
    ],
  };
}
