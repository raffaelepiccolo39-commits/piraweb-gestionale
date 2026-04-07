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
    // Only load if not already loaded
    if (profile || isLoading === false) return;
    loadProfile();

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
  }, [supabase, profile, isLoading, loadProfile, setProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    window.location.href = '/login';
  };

  return { profile, isLoading, signOut, supabase, retryLoadProfile: loadProfile };
}
