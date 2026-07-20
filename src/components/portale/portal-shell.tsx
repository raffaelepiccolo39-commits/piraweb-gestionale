'use client';

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
  const { clientName, fullName } = usePortal();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const firstName = fullName?.split(' ')[0] || '';

  return (
    <div className="min-h-screen bg-pw-bg flex flex-col">
      <header className="sticky top-0 z-40 border-b border-pw-border bg-pw-surface/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-pw-text-dim">
              {firstName ? `Ciao ${firstName}` : 'Area riservata'}
            </p>
            <h1 className="text-base font-semibold text-pw-text truncate">{clientName}</h1>
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
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'text-pw-accent' : 'text-pw-text-dim'
                )}
              >
                <Icon size={20} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
