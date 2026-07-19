'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, MessageSquare, FolderKanban, Calendar, LayoutGrid } from 'lucide-react';
import { MenuSheet } from '@/components/layout/menu-sheet';

/**
 * Barra di navigazione in basso, solo mobile (nascosta da lg in su). Le
 * destinazioni più usate dal telefono + "Menu" che apre il foglio con tutte le
 * sezioni. Sostituisce l'hamburger come navigazione primaria su mobile.
 */
const TABS = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Bacheca', href: '/team', icon: MessageSquare },
  { label: 'Progetti', href: '/projects', icon: FolderKanban },
  { label: 'Calendario', href: '/calendario', icon: Calendar },
];

export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-pw-surface/95 backdrop-blur border-t border-pw-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navigazione principale"
      >
        <div className="grid grid-cols-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[10px] font-medium transition-colors',
                  active ? 'text-pw-accent' : 'text-pw-text-dim',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span className="tracking-tight">{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-[10px] font-medium transition-colors',
              menuOpen ? 'text-pw-accent' : 'text-pw-text-dim',
            )}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            <LayoutGrid size={20} />
            <span className="tracking-tight">Menu</span>
          </button>
        </div>
      </nav>

      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
