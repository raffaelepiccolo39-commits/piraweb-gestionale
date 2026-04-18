import type { Metadata, Viewport } from 'next';
import { Syne, Bebas_Neue, DM_Serif_Display } from 'next/font/google';
import './globals.css';

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bebas',
});

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-dm-serif',
});

export const metadata: Metadata = {
  title: {
    default: 'PiraWeb Gestionale',
    template: '%s | PiraWeb Gestionale',
  },
  description: 'Gestionale interno PiraWeb - Gestione clienti, progetti e team',
  applicationName: 'PiraWeb',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PiraWeb Gestionale',
  },
};

export const viewport: Viewport = {
  themeColor: '#04080E',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${syne.variable} ${bebasNeue.variable} ${dmSerif.variable} h-full dark`} suppressHydrationWarning>
      <body className={`${syne.className} min-h-full bg-pw-bg text-pw-text antialiased`}>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}} />
      </body>
    </html>
  );
}
