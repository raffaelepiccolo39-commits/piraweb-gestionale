import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendario',
  description: 'Calendario appuntamenti e eventi del team - PiraWeb Gestionale',
};

export default function CalendarioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
