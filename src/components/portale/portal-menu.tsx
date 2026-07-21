'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home, LayoutGrid, Palette, FileText, Lightbulb, Receipt, FileSignature, Camera, BarChart3,
  MessageCircle, Hammer, Target, ChevronRight, X, LogOut,
} from 'lucide-react';

/**
 * Menu del portale: un foglio dal basso con TUTTE le voci, una per una.
 *
 * Stesso schema del gestionale (menu-sheet): la barra in basso tiene le tre
 * cose che si aprono ogni giorno, il menu contiene tutto il resto senza
 * dover comprimere sei voci in una barra.
 *
 * Le voci sono distinte di proposito — piano scatti, script e idee video
 * sono cose diverse per chi le riceve, anche se sotto condividono lo stesso
 * meccanismo di approvazione.
 */

export const VOCI_MENU = [
  {
    gruppo: 'I tuoi contenuti',
    voci: [
      { href: '/portale', label: 'Home', icona: Home },
      { href: '/portale/contenuti', label: 'Piano editoriale', icona: LayoutGrid },
    ],
  },
  {
    gruppo: 'Da approvare',
    voci: [
      { href: '/portale/piano-scatti', label: 'Moodboard', icona: Palette },
      { href: '/portale/script', label: 'Script video', icona: FileText },
      { href: '/portale/idee-video', label: 'Idee video', icona: Lightbulb },
    ],
  },
  {
    gruppo: 'Andamento',
    voci: [
      { href: '/portale/obiettivi', label: 'Obiettivi', icona: Target },
      { href: '/portale/lavori', label: 'A cosa stiamo lavorando', icona: Hammer },
      { href: '/portale/report', label: 'Come sta andando', icona: BarChart3 },
    ],
  },
  {
    gruppo: 'Shooting',
    voci: [
      { href: '/portale/shooting', label: 'Prenota uno shooting', icona: Camera },
    ],
  },
  {
    gruppo: 'Le tue idee',
    voci: [
      { href: '/portale/diario', label: 'Diario delle idee', icona: Lightbulb },
    ],
  },
  {
    gruppo: 'Il nostro rapporto',
    voci: [
      { href: '/portale/messaggi', label: 'Scrivici', icona: MessageCircle },
      { href: '/portale/pagamenti', label: 'Pagamenti', icona: Receipt },
      { href: '/portale/contratto', label: 'Contratto', icona: FileSignature },
    ],
  },
];

export function PortalMenu({
  aperto,
  onChiudi,
  onEsci,
  inAttesa,
}: {
  aperto: boolean;
  onChiudi: () => void;
  onEsci: () => void;
  /** Quante cose aspettano una risposta, per voce */
  inAttesa: Record<string, number>;
}) {
  const pathname = usePathname();
  if (!aperto) return null;

  return (
    <div className="fixed inset-0 z-50 lg:items-center lg:justify-center lg:flex">
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onChiudi}
        aria-label="Chiudi il menu"
      />

      <div className="absolute inset-x-0 bottom-0 lg:relative lg:max-w-md lg:w-full rounded-t-2xl lg:rounded-2xl bg-pw-surface border-t lg:border border-pw-border pb-[env(safe-area-inset-bottom)] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-pw-border">
          <h2 className="text-base font-semibold text-pw-text">Menu</h2>
          <button onClick={onChiudi} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2" aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>

        <div className="px-3 py-3">
          {VOCI_MENU.map((g) => (
            <div key={g.gruppo} className="mb-4 last:mb-0">
              <p className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim">
                {g.gruppo}
              </p>
              {g.voci.map((v) => {
                const Icona = v.icona;
                const attivo = pathname === v.href;
                const quanti = inAttesa[v.href] || 0;
                return (
                  <Link
                    key={v.href}
                    href={v.href}
                    onClick={onChiudi}
                    className={cn(
                      'flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors',
                      attivo ? 'bg-pw-accent/10 text-pw-accent' : 'text-pw-text hover:bg-pw-surface-2'
                    )}
                  >
                    <Icona size={18} className={attivo ? 'text-pw-accent' : 'text-pw-text-dim'} />
                    <span className="flex-1 text-sm font-medium">{v.label}</span>
                    {quanti > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-pw-accent text-[#0A263A] text-[11px] font-bold flex items-center justify-center">
                        {quanti}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-pw-text-dim" />
                  </Link>
                );
              })}
            </div>
          ))}

          <button
            onClick={onEsci}
            className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-pw-text-dim hover:bg-pw-surface-2 transition-colors mt-2 border-t border-pw-border pt-4"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Esci</span>
          </button>
        </div>
      </div>
    </div>
  );
}
