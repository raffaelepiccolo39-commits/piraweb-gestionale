'use client';

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';

/**
 * Menu mobile autonomo: pulsante hamburger + drawer, con stato LOCALE.
 * Nessun threading di stato tra layout e header (che in passato poteva
 * lasciare il menu "morto"). Il drawer sta sopra tutto (z-100).
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  // Blocca lo scroll del body quando il drawer è aperto
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-pw-text-muted hover:bg-pw-surface-2 active:bg-pw-surface-2"
        aria-label="Apri menu"
      >
        <Menu size={22} />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Menu di navigazione">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex">
            <Sidebar collapsed={false} onToggle={() => setOpen(false)} onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 -mr-11 p-2 rounded-lg bg-pw-surface text-pw-text-muted shadow-md"
              aria-label="Chiudi menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
