import type { Metadata } from 'next';
import { Inter, Syne, Bebas_Neue } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

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

export const metadata: Metadata = {
  title: 'PiraWeb Gestionale',
  description: 'Gestionale interno PiraWeb - Gestione clienti, progetti e team',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${inter.variable} ${syne.variable} ${bebasNeue.variable} h-full dark`} suppressHydrationWarning>
      <body className={`${inter.className} min-h-full bg-black text-pw-text antialiased`}>
        {children}
      </body>
    </html>
  );
}
