'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Home, LayoutGrid, Lightbulb, Menu as MenuIcon, ArrowLeft } from 'lucide-react';
import { PortalMenu } from './portal-menu';
import { PortalNotifiche } from './portal-notifiche';

/**
 * Guscio del portale: intestazione col nome del cliente e barra in basso.
 *
 * Stessa impostazione della navigazione mobile del gestionale (barra in
 * basso, non hamburger): è il pattern che il cliente si aspetta da un'app,
 * ed è quello che useremo se lo impacchettiamo per gli store.
 */

// La barra tiene solo cio che si apre spesso; tutto il resto sta nel menu,
// dove ogni voce ha il suo nome invece di essere accorpata.
const TABS = [
  { href: '/portale', label: 'Home', icon: Home },
  { href: '/portale/contenuti', label: 'Piano editoriale', icon: LayoutGrid },
  // Il diario e non i moodboard: e' l'unica voce in cui il cliente SCRIVE,
  // e una cosa che si fa quando viene in mente va raggiunta in un tocco.
  // I moodboard restano nel menu e si fanno vedere con il loro avviso in home.
  { href: '/portale/diario', label: 'Idee', icon: Lightbulb },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // Quanti contenuti aspettano una risposta: il pallino sulla barra e' il
  // motivo per cui si riapre un'app. Senza, il cliente non ha modo di sapere
  // che c'e qualcosa di nuovo se non entrando a controllare.
  const [menuAperto, setMenuAperto] = useState(false);
  const [inAttesa, setInAttesa] = useState<Record<string, number>>({});

  const contaAttesa = useCallback(async () => {
    const [post, materiali] = await Promise.all([
      supabase.from('social_posts').select('id', { count: 'exact', head: true })
        .eq('client_approval', 'pending').in('status', ['ready', 'scheduled']),
      supabase.from('client_materials').select('type')
        .eq('client_approval', 'pending'),
    ]);

    const perTipo = (t: string) =>
      ((materiali.data as { type: string }[]) || []).filter((m) => m.type === t).length;

    setInAttesa({
      '/portale/contenuti': post.count ?? 0,
      '/portale/piano-scatti': perTipo('moodboard'),
      '/portale/script': perTipo('script'),
      '/portale/idee-video': perTipo('idea_video'),
    });
  }, [supabase]);

  // Si riconta cambiando scheda: dopo un'approvazione il numero deve scendere
  // subito, non al prossimo ingresso.
  useEffect(() => { contaAttesa(); }, [contaAttesa, pathname]);

  return (
    /* Su telefono e' a schermo pieno, com'era. Da lg in su diventa una cornice
       stretta e centrata: e' un'app data ai clienti, e su un monitor grande
       una colonna larga 768px la faceva sembrare un sito. La cornice tiene la
       stessa larghezza di un telefono, cosi' quello che il cliente vede sul
       computer e' esattamente quello che vede sul suo. */
    <div className="min-h-dvh bg-pw-bg lg:bg-neutral-200/70 dark:lg:bg-black lg:flex lg:items-center lg:justify-center lg:py-6">
      <div className="relative flex flex-col min-h-dvh w-full bg-pw-bg
                      lg:min-h-0 lg:h-[calc(100dvh-3rem)] lg:max-w-[26rem]
                      lg:rounded-[2rem] lg:border lg:border-pw-border lg:shadow-2xl lg:overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-pw-border bg-pw-surface/95 backdrop-blur">
        {/* Solo il logo dell'agenzia. Il nome del cliente non serve — lo sa
            gia' di chi e' l'area in cui e' entrato — e "Esci" sta nel menu,
            dove si cerca: in barra era un bottone da sbagliare, accanto a
            niente altro su cui premere. */}
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1">
            {/* Fuori dalla home, la freccia per tornare.
                Va alla home e non alla pagina precedente del browser: da qui
                si arriva anche da un'email o da un segnalibro, e in quel caso
                "indietro" porterebbe fuori dal portale. Alla home ci si torna
                sempre, e da qualunque punto si sia entrati. */}
            {pathname !== '/portale' && (
              <Link
                href="/portale"
                aria-label="Torna alla home"
                className="-ml-2 p-2 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
              >
                <ArrowLeft size={19} />
              </Link>
            )}

            {/* Due file perche' il tema chiaro/scuro chiede due versioni, come
                gia fa la sidebar del gestionale. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Pira Web" className="h-7 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Pira Web" className="h-7 w-auto hidden dark:block" />
          </div>

          <PortalNotifiche inAttesa={inAttesa} />
        </div>
      </header>

      {/* Dentro la cornice il contenuto scorre da solo, non fa scorrere la
          finestra: e' quello che rende la barra in basso sempre ferma. */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 pb-24 lg:overflow-y-auto lg:max-w-none">
        {children}
      </main>

      {/* Sul telefono resta agganciata alla finestra; nella cornice si aggancia
          alla cornice, altrimenti finirebbe in fondo allo schermo del computer. */}
      <nav className="fixed bottom-0 inset-x-0 z-40 lg:absolute border-t border-pw-border bg-pw-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            const Icon = tab.icon;
            const badge = inAttesa[tab.href] || 0;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-pw-accent' : 'text-pw-text-dim'
                )}
              >
                <span className="relative">
                  <Icon size={20} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-pw-accent text-[#0A263A] text-[10px] font-bold flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            );
          })}

          <button
            onClick={() => setMenuAperto(true)}
            className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-pw-text-dim"
          >
            <span className="relative">
              <MenuIcon size={20} />
              {/* Il pallino sul Menu somma cio che sta nelle voci non in barra.
                  I moodboard sono in questa somma da quando la barra porta al
                  diario: senza, uscendo dalla barra sarebbero spariti dalla
                  vista. */}
              {((inAttesa['/portale/piano-scatti'] || 0)
                + (inAttesa['/portale/script'] || 0)
                + (inAttesa['/portale/idee-video'] || 0)) > 0 && (
                <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-pw-accent" />
              )}
            </span>
            Menu
          </button>
        </div>
      </nav>

      <PortalMenu
        aperto={menuAperto}
        onChiudi={() => setMenuAperto(false)}
        onEsci={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
        inAttesa={inAttesa}
      />
      </div>
    </div>
  );
}
