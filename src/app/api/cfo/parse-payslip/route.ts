export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Increase body size limit for PDF uploads (default 4.5MB is too small)
export const bodyParser = false;

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/cfo/parse-payslip
 * Receives a base64-encoded PDF, sends to Gemini AI to extract payslip data.
 * Body: { file: string (base64), mimeType: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_AI_API_KEY non configurata' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: 'Errore parsing body: ' + (err instanceof Error ? err.message : 'sconosciuto') }, { status: 400 });
  }

  const fileBase64 = typeof body.file === 'string' ? body.file : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/pdf';

  if (!fileBase64) {
    return NextResponse.json({ error: 'File mancante' }, { status: 400 });
  }

  // Fetch employee list for matching names
  const { data: employees } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('is_active', true)
    .order('full_name');

  const employeeList = (employees || []).map(e => `- "${e.full_name}" (id: ${e.id})`).join('\n');

  const prompt = `Analizza questo documento di buste paga (cedolini) e estrai i dati di OGNI dipendente presente.

DIPENDENTI REGISTRATI NEL SISTEMA:
${employeeList}

Per ogni busta paga trovata nel documento, restituisci un oggetto JSON con questi campi:
- employee_name: nome del dipendente come appare nel documento
- employee_id: l'id UUID del dipendente dalla lista sopra (fai matching per nome/cognome). Se non trovi corrispondenza metti null
- month: mese di riferimento in formato "YYYY-MM" (es. "2026-04")
- ral: Retribuzione Annua Lorda (se presente, altrimenti 0)
- lordo_mensile: stipendio lordo del mese
- netto_mensile: netto in busta
- inps_dipendente: contributi INPS a carico del dipendente
- irpef: ritenuta IRPEF
- addizionale_regionale: addizionale regionale (se presente, altrimenti 0)
- addizionale_comunale: addizionale comunale (se presente, altrimenti 0)
- bonus_100: trattamento integrativo / ex bonus Renzi (se presente, altrimenti 0)
- straordinari: importo straordinari (se presente, altrimenti 0)
- premi: premi o bonus (se presente, altrimenti 0)
- trattenute_varie: altre trattenute (se presente, altrimenti 0)
- inps_azienda: contributi INPS a carico azienda (se presente/calcolabile)
- tfr_accantonamento: TFR del mese (se presente/calcolabile)
- inail: premio INAIL (se presente, altrimenti 0)

IMPORTANTE:
- Tutti gli importi devono essere NUMERI (non stringhe), senza simbolo EUR
- Se un dato non e' presente nel documento, metti 0 (non null)
- Se il documento contiene piu' buste paga (piu' dipendenti), restituisci un array con tutti
- Il mese di riferimento potrebbe essere indicato come "competenza", "periodo", "mese" nel documento

Rispondi SOLO con un JSON valido, un array di oggetti. Nessun testo prima o dopo.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: fileBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error: ${res.status} - ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({
        error: 'Non sono riuscito a estrarre dati dal documento. Assicurati che sia un PDF di buste paga leggibile.',
        raw: textContent.slice(0, 500),
      }, { status: 422 });
    }

    const payslips = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      payslips,
      count: payslips.length,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return NextResponse.json({ error: `Errore analisi documento: ${msg}` }, { status: 500 });
  }
}
