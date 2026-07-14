import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import type { Profile } from '@/types/database';

/**
 * Layout della dashboard — Server Component.
 *
 * Carica il profilo QUI, sul server, e lo consegna già pronto al guscio client.
 *
 * Prima questo layout era 'use client' e il profilo veniva recuperato dal
 * browser: getUser() (giro di rete ai server auth di Supabase) e poi il fetch
 * del profilo, entrambi solo DOPO che il bundle JS era stato scaricato ed
 * eseguito. Siccome tutte le pagine sono protette da `if (!profile) return`,
 * per tutto quel tempo non partiva nessuna query e l'utente guardava una
 * schermata vuota.
 *
 * L'utente è già stato validato dal middleware, che ce lo passa nell'header
 * x-user-id: qui non serve rifare getUser().
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const userId = headerList.get('x-user-id');

  let profile: Profile | null = null;

  if (userId) {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    profile = (data as Profile | null) ?? null;
  }

  // Se il profilo non arriva (utente nuovo senza riga, o query fallita) il
  // guscio parte comunque: useAuth fa da rete di sicurezza e lo recupera dal
  // browser, esattamente come faceva prima.
  return <DashboardShell initialProfile={profile}>{children}</DashboardShell>;
}
