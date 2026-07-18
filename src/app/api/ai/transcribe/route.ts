export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/require-admin';
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

/**
 * Trascrizione audio → testo. Primario: Google Gemini (chiave attiva, accetta
 * wav/ogg/mp3 — le note vocali WhatsApp sono ogg, il browser invia wav). In
 * fallback OpenAI Whisper, se un giorno l'account OpenAI torna con credito.
 * L'audio arriva come file nel form-data.
 */

const PROMPT = 'Trascrivi fedelmente in italiano questo audio. Rispondi SOLO con il testo trascritto, senza commenti.';

async function transcribeGemini(base64: string, mime: string): Promise<string> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GOOGLE_AI_API_KEY || '' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: base64 } }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

async function transcribeWhisper(audio: File): Promise<string> {
  const upstream = new FormData();
  upstream.append('file', audio, audio.name || 'audio.wav');
  upstream.append('model', 'whisper-1');
  upstream.append('language', 'it');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: upstream,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.text ?? '';
}

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

  const mime = audio.type || 'audio/wav';
  const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64');

  try {
    const text = await transcribeGemini(base64, mime);
    return NextResponse.json({ text });
  } catch (geminiErr) {
    await logError({ error: geminiErr, route: '/api/ai/transcribe', source: 'api', context: { op: 'transcribe', provider: 'gemini' } });
    try {
      const text = await transcribeWhisper(audio);
      return NextResponse.json({ text });
    } catch (whisperErr) {
      await logError({ error: whisperErr, route: '/api/ai/transcribe', source: 'api', context: { op: 'transcribe', provider: 'whisper' } });
      return NextResponse.json({ error: 'Errore nella trascrizione audio' }, { status: 500 });
    }
  }
}
