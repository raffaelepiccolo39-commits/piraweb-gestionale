'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ShieldOff } from 'lucide-react';

/**
 * Guardia del portale clienti.
 *
 * Volutamente lato client e non nel middleware: il portale deve poter essere
 * impacchettato come app (Capacitor), dove il middleware non gira. La
 * sicurezza vera non sta comunque qui — sta nelle policy RLS costruite su
 * current_client_id(): anche saltando questo componente non si leggerebbe
 * nulla che non sia del proprio cliente. Questo serve a mostrare la
 * schermata giusta, non a proteggere i dati.
 */

interface PortalIdentity {
  userId: string;
  clientId: string;
  clientName: string;
  clientLogo: string | null;
  fullName: string | null;
  email: string;
  passwordScelta: boolean;
}

const PortalContext = createContext<PortalIdentity | null>(null);

export function usePortal(): PortalIdentity {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal va usato dentro PortalGate');
  return ctx;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; identity: PortalIdentity }
  | { kind: 'no_access' };

export function PortalGate({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) { router.replace('/login'); return; }

      // La riga del portale è leggibile solo dal suo proprietario (policy
      // "Il cliente legge il proprio accesso"). Il nome del cliente arriva
      // dall'embed: se l'accesso è revocato, la RLS su clients non lo
      // restituisce e restiamo comunque fuori.
      const { data } = await supabase
        .from('client_portal_users')
        .select('id, client_id, email, full_name, is_active, password_set_at, client:clients(name, company, logo_url)')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const row = data as {
        id: string; client_id: string; email: string; full_name: string | null;
        is_active: boolean; password_set_at: string | null;
        client: { name: string; company: string | null; logo_url: string | null } | null;
      } | null;

      if (!row || !row.is_active) { setState({ kind: 'no_access' }); return; }

      setState({
        kind: 'ok',
        identity: {
          userId: row.id,
          clientId: row.client_id,
          clientName: row.client?.company || row.client?.name || '',
          clientLogo: row.client?.logo_url || null,
          fullName: row.full_name,
          email: row.email,
          passwordScelta: !!row.password_set_at,
        },
      });

      // Chi non ha ancora scelto la password entra solo col link dell'invito,
      // che scade: va portato subito a sceglierla, prima di guardarsi in giro.
      if (!row.password_set_at && !window.location.pathname.startsWith('/portale/benvenuto')) {
        router.replace('/portale/benvenuto');
      }

      // Segna il passaggio, così nel gestionale si vede chi è entrato e quando.
      // Via API: il cliente non ha il permesso di scrivere sulla propria riga.
      fetch('/api/portal/ping', { method: 'POST' }).catch(() => {});
    })();

    return () => { cancelled = true; };
  }, [supabase, router, pathname]);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-pw-text-dim">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (state.kind === 'no_access') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center rounded-2xl border border-pw-border bg-pw-surface p-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
            <ShieldOff size={26} className="text-pw-accent" />
          </div>
          <h1 className="text-xl font-bold text-pw-text mb-2">Accesso non attivo</h1>
          {/* Unico "scrivici" che resta un'email: chi non ha accesso non può
              usare la conversazione interna, che sta dietro il portale. */}
          <p className="text-sm text-pw-text-muted mb-6">
            Questo account non ha un&apos;area riservata attiva. Se pensi si tratti di un errore,{' '}
            <a href="mailto:info@piraweb.it?subject=Accesso%20al%20portale" className="text-pw-accent hover:underline">
              scrivici
            </a>{' '}
            e la riattiviamo.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
            className="text-sm text-pw-text-dim underline"
          >
            Esci
          </button>
        </div>
      </div>
    );
  }

  return <PortalContext.Provider value={state.identity}>{children}</PortalContext.Provider>;
}
