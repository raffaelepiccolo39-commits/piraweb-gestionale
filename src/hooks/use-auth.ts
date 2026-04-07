'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import type { Profile } from '@/types/database';

let fetchPromise: Promise<void> | null = null;

export function useAuth() {
  const { profile, isLoading, setProfile, setLoading } = useAuthStore();
  const supabase = createClient();
  const initialized = useRef(false);

  useEffect(() => {
    // Skip if already loaded or loading
    if (profile || initialized.current) return;
    initialized.current = true;

    const getProfile = async () => {
      // Deduplicate concurrent calls
      if (fetchPromise) return fetchPromise;

      fetchPromise = (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            setProfile(data as Profile | null);
          } else {
            setProfile(null);
          }
        } catch {
          setProfile(null);
        } finally {
          fetchPromise = null;
        }
      })();

      return fetchPromise;
    };

    getProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          setProfile(data as Profile | null);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          initialized.current = false;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, setProfile, setLoading, profile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    initialized.current = false;
    window.location.href = '/login';
  };

  return { profile, isLoading, signOut, supabase };
}
