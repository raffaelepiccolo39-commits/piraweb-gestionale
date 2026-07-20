import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PiraWeb Gestionale',
    short_name: 'PiraWeb',
    description: 'Gestionale interno PiraWeb - Gestione clienti, progetti e team',
    start_url: '/dashboard',
    // Scope su tutta l'app: la PWA installata deve considerare "dentro l'app"
    // ogni pagina (/tasks, /clienti, /chat…), non solo /dashboard. Con scope
    // ristretto le scorciatoie fuori-scope venivano ignorate dal browser
    // (warning "property 'url' ignored / not present" nel manifest).
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0A263A',
    theme_color: '#0A263A',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
