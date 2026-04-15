import { create } from 'zustand';
import type { Profile } from '@/types/database';

interface AuthState {
  profile: Profile | null;
  isLoading: boolean;
  _hydrated: boolean;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  isLoading: true,
  _hydrated: false,
  setProfile: (profile) => set({ profile, isLoading: false, _hydrated: true }),
  setLoading: (isLoading) => set({ isLoading }),
}));
