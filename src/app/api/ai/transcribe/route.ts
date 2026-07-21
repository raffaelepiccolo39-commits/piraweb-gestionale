export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/require-admin';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { trascrivi } from '@/lib/trascrizione';

/**
 * Trascrizione audio per il team (cattura rapida).
 * Il motore sta in lib/trascrizione: lo condivide con il diario delle idee
 * dei clienti, che ha un controllo d'accesso diverso ma lo stesso motore.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Riservato agli amministratori' }, { status: 403 });
  }

  const rateLimit = checkRateLimit(`ai:transcribe:${user.id}`, AI_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Troppe richieste. Riprova tra qualche minuto.' }, { status: 429 });
  }

  let audio: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('audio');
    if (f instanceof File) audio = f;
  } catch {
    return NextResponse.json({ error: 'Audio non valido' }, { status: 400 });
  }
  if (!audio) return NextResponse.json({ error: 'Audio mancante' }, { status: 400 });

  try {
    return NextResponse.json({ text: await trascrivi(audio, '/api/ai/transcribe') });
  } catch {
    return NextResponse.json({ error: 'Errore nella trascrizione audio' }, { status: 500 });
  }
}
