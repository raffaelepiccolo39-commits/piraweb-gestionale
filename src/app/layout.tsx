import type { Metadata, Viewport } from 'next';
import { Inter, Syne, JetBrains_Mono, Bebas_Neue, DM_Serif_Display } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
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
  themeColor: '#0A263A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${inter.variable} ${syne.variable} ${jetbrainsMono.variable} ${bebasNeue.variable} ${dmSerif.variable} h-full`} suppressHydrationWarning>
      <body className={`${inter.className} min-h-full bg-pw-bg text-pw-text antialiased`}>
        {/* DIAGNOSTICA temporanea: mostra a schermo eventuali errori JS (utile su mobile) */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            function show(msg){
              try{
                var el=document.getElementById('__jserr__');
                if(!el){el=document.createElement('div');el.id='__jserr__';el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#c1121f;color:#fff;font:11px/1.4 monospace;padding:8px;white-space:pre-wrap;max-height:60vh;overflow:auto';document.body&&document.body.appendChild(el);}
                el.textContent=(el.textContent?el.textContent+'\\n\\n':'')+'JS ERROR: '+msg;
              }catch(_){}
            }
            window.addEventListener('error',function(e){show((e.message||'errore')+' @ '+((e.filename||'').split('/').pop())+':'+(e.lineno||''));});
            window.addEventListener('unhandledrejection',function(e){var r=e.reason;show('promise: '+((r&&(r.message||r.toString&&r.toString()))||r||''));});
          })();
        `}} />
        <ThemeProvider>
          {children}
        </ThemeProvider>
        {/* Vercel Analytics: page views, top pages, referrer */}
        <Analytics />
        {/* Speed Insights: Web Vitals reali (LCP, INP, CLS, ecc.) */}
        <SpeedInsights />
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
