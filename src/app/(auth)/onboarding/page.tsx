import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OnboardingWizard from './wizard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Benvenuto in PiraWeb' };

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, onboarded_at, must_change_password, avatar_url')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');
  if (profile.onboarded_at) redirect('/dashboard');

  return (
    <OnboardingWizard
      email={user.email || ''}
      fullName={profile.full_name}
      role={profile.role}
      avatarUrl={profile.avatar_url}
      mustChangePassword={profile.must_change_password}
    />
  );
}
