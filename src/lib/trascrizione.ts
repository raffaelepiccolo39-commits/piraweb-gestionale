import { logError } from '@/lib/logger';

/**
 * Trascrizione audio → testo.
 *
 * Primario Google Gemini (chiave attiva, accetta wav/ogg/mp3 — le note vocali
 * di WhatsApp sono ogg, il browser manda wav), con Whisper come riserva se un
 * giorno l'account OpenAI tornerà ad avere credito.
 *
 * Sta qui e non dentro una route perché la usano in due: la cattura rapida
 * del team e il diario delle idee dei clienti. Duplicarla avrebbe voluto dire
 * che una delle due, prima o poi, resta indietro sull'altra.
 */

const PROMPT = 'Trascrivi fedelmente in italiano questo audio. Rispondi SOLO con il testo trascritto, senza commenti.';

async function conGemini(base64: string, mime: string): Promise<string> {
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

async function conWhisper(audio: File): Promise<string> {
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

/**
 * Trascrive, provando prima Gemini e poi Whisper.
 * Lancia solo se falliscono entrambi.
 */
export async function trascrivi(audio: File, route: string): Promise<string> {
  const mime = audio.type || 'audio/wav';
  const base64 = Buffer.from(await audio.arrayBuffer()).toString('base64');

  try {
    return await conGemini(base64, mime);
  } catch (erroreGemini) {
    await logError({ error: erroreGemini, route, source: 'api', context: { op: 'transcribe', provider: 'gemini' } });
    try {
      return await conWhisper(audio);
    } catch (erroreWhisper) {
      await logError({ error: erroreWhisper, route, source: 'api', context: { op: 'transcribe', provider: 'whisper' } });
      throw erroreWhisper;
    }
  }
}
