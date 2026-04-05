'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import type { Profile } from '@/types/database';

export function useAuth() {
  const { profile, isLoading, setProfile, setLoading } = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    const getProfile = async () => {
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
      }
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
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, setProfile, setLoading]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    window.location.href = '/login';
  };

  return { profile, isLoading, signOut, supabase };
}
