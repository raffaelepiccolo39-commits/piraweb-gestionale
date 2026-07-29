'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import { reportUnknown, reportSupabaseError } from '@/lib/report-error';
import type { Profile } from '@/types/database';

export function useAuth() {
  const { profile, isLoading, setProfile, setLoading } = useAuthStore();
  const supabase = createClient();
  const fetchingRef = useRef(false);

  const loadProfile = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setProfile(null);
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
            window.location.replace('/portale');
          }
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
  }, [supabase, setProfile, setLoading]);

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
    // Cancella cookie 2FA (httpOnly, serve API server-side)
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await supabase.auth.signOut();
    setProfile(null);
    window.location.href = '/login';
  };

  return { profile, isLoading, signOut, supabase, retryLoadProfile: loadProfile };
}
