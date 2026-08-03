'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isPackagedApp } from '@/lib/api-origin';
import { dimenticaDispositivo } from '@/lib/push-client';
import { useAuthStore } from '@/store/auth-store';
import { reportUnknown, reportSupabaseError } from '@/lib/report-error';
import type { Profile } from '@/types/database';

/** Pagine che vivono senza sessione: mandarci il redirect sarebbe un cerchio. */
const PAGINE_SENZA_SESSIONE = ['/login', '/onboarding', '/password-dimenticata', '/reimposta-password'];

function suPaginaPubblica(): boolean {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname;
  return PAGINE_SENZA_SESSIONE.some((p) => path === p || path.startsWith(`${p}/`));
}

export function useAuth() {
  const { profile, isLoading, setProfile, setLoading } = useAuthStore();
  const supabase = createClient();
  const router = useRouter();
  const fetchingRef = useRef(false);

  const loadProfile = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setProfile(null);

        /**
         * Chi rimanda al login quando la sessione non c'e'? Sul sito il proxy
         * (`src/proxy.ts`). Nel pacchetto iOS/Android nessuno: `build:app` lo
         * toglie, perche' l'export statico non lo tollera. Risultato visto
         * sull'app approvata da Apple: si apre su /dashboard, l'AttendanceGate
         * aspetta un profilo che non arrivera' mai e resta uno spinner
         * infinito, senza nessuna strada per arrivare al login.
         *
         * Qui il redirect lo fa il client. `router.replace` e non
         * `window.location`: nel pacchetto un caricamento di documento su
         * /login cade sul fallback index.html di Capacitor, che rimanda a
         * /dashboard — cioe' al punto di partenza.
         *
         * Solo se la sessione manca davvero: un errore di rete su getUser()
         * non deve buttare fuori chi e' gia' dentro. getSession() legge
         * l'archivio locale e non tocca la rete.
         */
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && !suPaginaPubblica()) router.replace('/login');
        return;
      }

      // Try to fetch existing profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data as Profile);
        return;
      }

      // Profile missing — try RPC auto-create
      if (error?.code === 'PGRST116' /* no rows */) {
        const { data: synced, error: rpcError } = await supabase.rpc('ensure_my_profile');

        /**
         * Il rifiuto per un cliente del portale non e' un errore: e' la
         * difesa che funziona. Ma finora finiva solo nel registro, e il
         * cliente restava su /dashboard con la barra del TEAM (Bacheca,
         * Progetti, Calendario) e uno spinner che non finisce mai — perche'
         * l'AttendanceGate aspetta un profilo che non arrivera'.
         *
         * Succede davvero: basta un segnalibro vecchio o l'icona sulla Home
         * del telefono che punta a /dashboard. Qui lo si riporta a casa sua.
         */
        const eUnCliente = rpcError?.code === 'P0001'
          && /accesso cliente/i.test(rpcError.message || '');

        if (eUnCliente) {
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/portale')) {
            router.replace('/portale');
          }
          return;
        }

        /**
         * Account senza invito. Non e' un errore del gestionale: e' la
         * difesa che funziona (chiunque avesse un account, aprendo la
         * dashboard, si creava un profilo del team). Lo si riporta al login
         * con scritto perche', invece di lasciarlo davanti a un messaggio
         * generico sulla connessione, che manderebbe a cercare un guasto che
         * non c'e'.
         */
        if (rpcError?.code === 'P0002') {
          await supabase.auth.signOut();
          router.replace(`/login?error=${encodeURIComponent(rpcError.message)}`);
          return;
        }

        if (rpcError) reportSupabaseError(rpcError, 'use-auth-ensure-profile');
        if (!rpcError && synced) {
          setProfile(synced as Profile);
          return;
        }
      }

      setProfile(null);
    } catch (err) {
      reportUnknown(err, 'client', { op: 'use-auth-load-profile' });
      setProfile(null);
    } finally {
      fetchingRef.current = false;
    }
  }, [supabase, setProfile, setLoading, router]);

  useEffect(() => {
    if (!profile) {
      loadProfile();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await loadProfile();
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    // Prima della disconnessione: dopo, l'RLS non lascerebbe piu' cancellare
    // la riga del dispositivo, e il telefono resterebbe agganciato a chi esce.
    await dimenticaDispositivo();
    // Cancella cookie 2FA (httpOnly, serve API server-side)
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await supabase.auth.signOut();
    setProfile(null);
    // Sul sito navigazione dura: costringe il proxy a rileggere i cookie.
    // Nel pacchetto no: un documento su /login cadrebbe sul fallback
    // index.html di Capacitor, che rimanda a /dashboard.
    if (isPackagedApp()) router.replace('/login');
    else window.location.href = '/login';
  };

  return { profile, isLoading, signOut, supabase, retryLoadProfile: loadProfile };
}
