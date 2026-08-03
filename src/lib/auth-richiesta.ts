/**
 * Chi sta chiamando questa rotta.
 *
 * Sul sito la sessione viaggia nei cookie. Nel pacchetto iOS/Android no: li'
 * vive in localStorage, perche' sullo schema `capacitor://` i cookie non
 * sopravvivono — quindi l'app manda il token nell'intestazione.
 *
 * Le rotte che devono funzionare in entrambi i posti passano da qui, invece
 * di controllare solo i cookie e rispondere 401 all'app senza spiegazione.
 */

import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface UtenteRichiesta {
  id: string;
  email: string | null;
}

export async function utenteDellaRichiesta(request: NextRequest): Promise<UtenteRichiesta | null> {
  const supabase = await createServerSupabaseClient();

  const { data: { user: daCookie } } = await supabase.auth.getUser();
  if (daCookie) return { id: daCookie.id, email: daCookie.email ?? null };

  const intestazione = request.headers.get('authorization');
  const token = intestazione?.startsWith('Bearer ') ? intestazione.slice(7) : null;
  if (!token) return null;

  const { data } = await supabase.auth.getUser(token);
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}
