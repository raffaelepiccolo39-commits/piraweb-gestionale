'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { navSections } from '@/components/layout/nav-config';
import { TINT, tintForPath } from '@/lib/tints';
import { X, ChevronRight, LogOut, Moon, Sun } from 'lucide-react';

/**
 * Menu a foglio (mobile): tutte le sezioni raggruppate, con icona + etichetta,
 * più tema e logout in fondo. Aperto dalla voce "Menu" della barra in basso.
 * Riprende l'impostazione delle reference (Kidville) col brand del gestionale.
 */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const pathname = usePathname();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDark(document.documentElement.classList.contains('dark'));
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('darkMode', String(next)); } catch { /* ignore */ }
  }

  const content = (
    <div className="lg:hidden fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[88vh] flex flex-col rounded-t-2xl bg-pw-surface border-t border-pw-border shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.4)] animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-pw-border">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-pw-text-dim font-[var(--font-jetbrains)]">Tutte le sezioni</p>
            <h2 className="text-lg font-semibold text-pw-text">Menu</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-pw-surface-2 text-pw-text-dim hover:text-pw-text"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="overflow-y-auto px-4 py-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        >
          {navSections
            .filter((s) => !s.adminOnly || isAdmin)
            .map((section, i) => {
              const items = section.items.filter((it) => !it.adminOnly || isAdmin);
              if (items.length === 0) return null;
              return (
                <div key={section.label ?? i} className="mb-4">
                  {section.label && (
                    <p className="px-1 mb-2 text-[11px] uppercase tracking-[0.12em] text-pw-text-dim font-[var(--font-jetbrains)]">
                      {section.label}
                    </p>
                  )}
                  <div className="flex flex-col gap-1">
                    {items.map((it) => {
                      const Icon = it.icon;
                      const active = isActive(it.href);
                      const tint = TINT[tintForPath(it.href)];
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          onClick={onClose}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                            active ? 'bg-pw-accent/10' : 'active:bg-pw-surface-2',
                          )}
                        >
                          <span className={cn(
                            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                            active ? 'bg-pw-accent/15 text-pw-accent' : `${tint.bg} ${tint.fg}`,
                          )}>
                            <Icon size={18} />
                          </span>
                          <span className={cn('flex-1 text-sm font-medium', active ? 'text-pw-accent' : 'text-pw-text')}>
                            {it.label}
                          </span>
                          <ChevronRight size={16} className="text-pw-text-dim" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          <div className="mt-2 pt-3 border-t border-pw-border flex gap-2">
            <button
              onClick={toggleTheme}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-pw-border py-2.5 text-sm font-medium text-pw-text active:bg-pw-surface-2"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Tema chiaro' : 'Tema scuro'}
            </button>
            <button
              onClick={() => { onClose(); signOut(); }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-pw-border py-2.5 text-sm font-medium text-pw-danger active:bg-pw-danger/5"
            >
              <LogOut size={16} /> Esci
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
