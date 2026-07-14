'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
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
      // getSession() legge la sessione dal cookie: nessun giro di rete.
      // getUser() invece interroga ogni volta i server auth di Supabase, e lo
      // faceva a ogni caricamento a freddo, in mezzo al percorso critico.
      // Qui non è un confine di sicurezza — chi decide cosa può vedere è la RLS
      // di Postgres, e il middleware valida comunque l'utente lato server.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
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
        if (!rpcError && synced) {
          setProfile(synced as Profile);
          return;
        }
      }

      setProfile(null);
    } catch {
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
