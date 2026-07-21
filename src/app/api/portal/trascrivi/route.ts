export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { trascrivi } from '@/lib/trascrizione';

/**
 * Trascrizione audio per il cliente, nel diario delle idee.
 *
 * Un'idea si racconta a voce molto meglio di come si scrive col pollice — ed
 * è il modo in cui i clienti già ci mandano le cose su WhatsApp. Qui finisce
 * nel diario invece che nella chat di qualcuno.
 *
 * Route separata da quella del team perché il controllo d'accesso è diverso:
 * lì admin, qui cliente del portale. Il motore invece è lo stesso.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const service = await createServiceRoleClient();
  const { data: portale } = await service
    .from('client_portal_users')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!portale) return NextResponse.json({ error: 'Riservato ai clienti' }, { status: 403 });

  const limite = checkRateLimit(`portal:trascrivi:${user.id}`, AI_RATE_LIMIT);
  if (!limite.allowed) {
    return NextResponse.json({ error: 'Hai registrato molti audio di fila. Riprova fra qualche minuto.' }, { status: 429 });
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

  // Un vocale lunghissimo costa e quasi sempre è un errore di registrazione.
  if (audio.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio troppo lungo: registra un messaggio più breve' }, { status: 413 });
  }

  try {
    return NextResponse.json({ text: await trascrivi(audio, '/api/portal/trascrivi') });
  } catch {
    return NextResponse.json({ error: 'Non sono riuscito a trascrivere, prova a scrivere l’idea' }, { status: 500 });
  }
}
