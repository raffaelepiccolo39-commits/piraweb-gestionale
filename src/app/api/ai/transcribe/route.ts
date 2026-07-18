export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

/**
 * Trascrizione audio → testo (OpenAI Whisper). L'audio arriva come file nel
 * form-data (dalla Cattura rapida: nota vocale registrata o caricata). Il testo
 * torna al client, che poi lo passa all'agente (capture-action).
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

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
    const upstream = new FormData();
    upstream.append('file', audio, audio.name || 'audio.webm');
    upstream.append('model', 'whisper-1');
    upstream.append('language', 'it');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: upstream,
    });
    if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return NextResponse.json({ text: data.text ?? '' });
  } catch (e) {
    await logError({ error: e, route: '/api/ai/transcribe', source: 'api', context: { op: 'transcribe' } });
    return NextResponse.json({ error: 'Errore nella trascrizione audio' }, { status: 500 });
  }
}
