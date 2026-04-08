import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Note Dev',
  description: 'Segnalazioni bug, richieste funzionalità e miglioramenti - PiraWeb Gestionale',
};

export default function NoteDevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
