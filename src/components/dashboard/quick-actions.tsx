'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Clock, MessageSquare, Plane, MessageSquarePlus, Calendar } from 'lucide-react';

/**
 * Scorciatoie a tile per la home mobile (nascoste da lg in su): le azioni più
 * frequenti dal telefono, a portata di pollice. Riprende i quick-action delle
 * reference (Kidville) col brand del gestionale.
 */
export function QuickActions() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const tiles = isAdmin
    ? [
        { label: 'Cattura', href: '/cattura', icon: MessageSquarePlus },
        { label: 'Presenze', href: '/presenze', icon: Clock },
        { label: 'Bacheca', href: '/team', icon: MessageSquare },
        { label: 'Calendario', href: '/calendario', icon: Calendar },
      ]
    : [
        { label: 'Presenze', href: '/presenze', icon: Clock },
        { label: 'Bacheca', href: '/team', icon: MessageSquare },
        { label: 'Ferie', href: '/ferie', icon: Plane },
        { label: 'Calendario', href: '/calendario', icon: Calendar },
      ];

  return (
    <div className="lg:hidden grid grid-cols-4 gap-2">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-pw-border bg-pw-surface p-3 active:bg-pw-surface-2 transition-colors"
          >
            <span className="w-10 h-10 rounded-lg bg-pw-accent/10 text-pw-accent flex items-center justify-center">
              <Icon size={20} />
            </span>
            <span className="text-[11px] font-medium text-pw-text text-center leading-tight">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
