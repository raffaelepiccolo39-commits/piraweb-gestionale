'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { usePortal } from './portal-gate';
import { cn } from '@/lib/utils';
import { LayoutGrid, Receipt, FileText, LogOut } from 'lucide-react';

/**
 * Guscio del portale: intestazione col nome del cliente e barra in basso.
 *
 * Stessa impostazione della navigazione mobile del gestionale (barra in
 * basso, non hamburger): è il pattern che il cliente si aspetta da un'app,
 * ed è quello che useremo se lo impacchettiamo per gli store.
 */

const TABS = [
  { href: '/portale', label: 'Contenuti', icon: LayoutGrid },
  { href: '/portale/pagamenti', label: 'Pagamenti', icon: Receipt },
  { href: '/portale/contratto', label: 'Contratto', icon: FileText },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { clientName } = usePortal();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // Quanti contenuti aspettano una risposta: il pallino sulla barra e' il
  // motivo per cui si riapre un'app. Senza, il cliente non ha modo di sapere
  // che c'e qualcosa di nuovo se non entrando a controllare.
  const [daApprovare, setDaApprovare] = useState(0);

  const contaAttesa = useCallback(async () => {
    const { count } = await supabase
      .from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_approval', 'pending')
      .in('status', ['ready', 'scheduled']);
    setDaApprovare(count ?? 0);
  }, [supabase]);

  // Si riconta cambiando scheda: dopo un'approvazione il numero deve scendere
  // subito, non al prossimo ingresso.
  useEffect(() => { contaAttesa(); }, [contaAttesa, pathname]);

  return (
    <div className="min-h-screen bg-pw-bg flex flex-col">
      <header className="sticky top-0 z-40 border-b border-pw-border bg-pw-surface/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Il logo dell'agenzia: e' il nostro spazio, offerto al cliente.
              Due file perche' il tema chiaro/scuro chiede due versioni, come
              gia fa la sidebar del gestionale. */}
          <div className="min-w-0 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-dark.png" alt="Pira Web" className="h-7 w-auto dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Pira Web" className="h-7 w-auto hidden dark:block" />
            <span className="text-sm text-pw-text-dim truncate border-l border-pw-border pl-3">
              {clientName}
            </span>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
            className="shrink-0 p-2 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
            aria-label="Esci"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-pw-border bg-pw-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-3xl mx-auto grid grid-cols-3">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            const Icon = tab.icon;
            const badge = tab.href === '/portale' ? daApprovare : 0;
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
        </div>
      </nav>
    </div>
  );
}
