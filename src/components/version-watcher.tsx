'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

/**
 * Rileva quando in produzione è uscita una nuova versione dell'app e propone
 * di ricaricare. Evita che chi tiene la scheda aperta resti bloccato su una
 * build vecchia (link "morti", sezioni non aggiornate).
 */
export function VersionWatcher() {
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (CURRENT === 'dev') return; // in locale non ha senso
    let active = true;

    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = await res.json();
        if (active && id && id !== 'dev' && id !== CURRENT) setStale(true);
      } catch {
        /* rete assente: riproveremo */
      }
    };

    const interval = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    check();

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const handleReload = async () => {
    setReloading(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* procediamo comunque col reload */
    }
    window.location.reload();
  };

  if (!stale) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 rounded-2xl border border-[var(--pw-gold)]/40 bg-[var(--pw-navy)] px-4 py-3 shadow-xl animate-slide-up"
    >
      <Sparkles size={16} className="text-[var(--pw-gold)] shrink-0" aria-hidden="true" />
      <span className="text-sm text-white/90">È disponibile una nuova versione.</span>
      <button
        onClick={handleReload}
        disabled={reloading}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--pw-gold)] px-3 py-1.5 text-sm font-semibold text-[var(--pw-navy)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} aria-hidden="true" />
        {reloading ? 'Ricarico…' : 'Ricarica'}
      </button>
    </div>
  );
}
