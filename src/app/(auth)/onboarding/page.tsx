'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import OnboardingWizard from './wizard';

/**
 * Lato client, non server.
 *
 * Prima leggeva la sessione dai cookie con `dynamic = 'force-dynamic'`: va
 * benissimo sul web, ma l'esportazione statica per l'app (Capacitor) non
 * ammette pagine che si rendono a richiesta — non c'è un server dietro.
 * Era l'ultimo ostacolo al build dell'app.
 *
 * Qui la sessione si legge dal browser, come fa la guardia del portale. Il
 * wizard e i dati che riceve non cambiano.
 */

interface Dati {
  email: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [dati, setDati] = useState<Dati | null>(null);

  useEffect(() => {
    let annullato = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (annullato) return;
      if (!user) { router.replace('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, onboarded_at, must_change_password, avatar_url')
        .eq('id', user.id)
        .single();

      if (annullato) return;
      if (!profile) { router.replace('/login'); return; }
      if (profile.onboarded_at) { router.replace('/dashboard'); return; }

      setDati({
        email: user.email || '',
        fullName: profile.full_name,
        role: profile.role,
        avatarUrl: profile.avatar_url,
        mustChangePassword: profile.must_change_password,
      });
    })();

    return () => { annullato = true; };
  }, [supabase, router]);

  if (!dati) {
    return (
      <div className="min-h-screen flex items-center justify-center text-pw-text-dim">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <OnboardingWizard
      email={dati.email}
      fullName={dati.fullName}
      role={dati.role as Parameters<typeof OnboardingWizard>[0]['role']}
      avatarUrl={dati.avatarUrl}
      mustChangePassword={dati.mustChangePassword}
    />
  );
}
