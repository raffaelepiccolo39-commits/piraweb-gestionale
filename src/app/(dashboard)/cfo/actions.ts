'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Server Action to parse payslip PDF via Gemini AI.
 * Server Actions support larger file uploads than API routes on Vercel.
 */
export async function parsePayslipAction(base64: string, mimeType: string): Promise<{
  success: boolean;
  payslips?: Record<string, unknown>[];
  count?: number;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non autorizzato' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Solo admin' };

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { success: false, error: 'GOOGLE_AI_API_KEY non configurata' };

  if (!base64) return { success: false, error: 'File mancante' };

  // Fetch employees for name matching
  const { data: employees } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('is_active', true)
    .order('full_name');

  const employeeList = (employees || []).map(e => `- "${e.full_name}" (id: ${e.id})`).join('\n');

  const prompt = `Analizza questo documento di buste paga (cedolini) e estrai i dati di OGNI dipendente presente.

DIPENDENTI REGISTRATI NEL SISTEMA:
${employeeList}

Per ogni busta paga trovata, restituisci un oggetto JSON con:
- employee_name: nome dal documento
- employee_id: UUID dalla lista sopra (matching per nome/cognome), null se non trovato
- month: formato "YYYY-MM"
- lordo_mensile: totale competenze (numero)
- netto_mensile: netto in busta (numero)
- inps_dipendente: ritenute INPS dipendente (numero)
- irpef: IRPEF netta trattenuta (numero, 0 se coperta da detrazioni)
- addizionale_regionale: (numero, 0 se assente)
- addizionale_comunale: (numero, 0 se assente)
- bonus_100: trattamento integrativo / bonus DL 03/2020 (numero)
- straordinari: (numero, 0 se assente)
- premi: premio gratifica o altri premi (numero)
- trattenute_varie: altre trattenute (numero)
- inps_azienda: contributi INPS carico azienda / ritenute sociali (numero)
- tfr_accantonamento: quota TFR mese (numero)
- inail: (numero, 0 se assente)

Tutti importi come NUMERI. Rispondi SOLO con un JSON array valido, nessun testo.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Gemini error: ${res.status} - ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      return { success: false, error: 'Non sono riuscito a estrarre dati. Assicurati che il PDF sia leggibile.' };
    }

    const payslips = JSON.parse(jsonMatch[0]);
    return { success: true, payslips, count: payslips.length };

  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Errore sconosciuto' };
  }
}

/**
 * Server Action to save parsed payslips to database.
 * Uses server-side Supabase client which has proper auth for RLS.
 */
export async function savePayslipsAction(payslips: Record<string, unknown>[]): Promise<{
  success: boolean;
  saved?: number;
  errors?: number;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non autorizzato' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Solo admin' };

  let saved = 0;
  let errors = 0;

  for (const ps of payslips) {
    const p = ps as Record<string, unknown>;
    if (!p.employee_id || !p.lordo_mensile || !p.netto_mensile) { errors++; continue; }

    const lordo = Number(p.lordo_mensile) || 0;
    const inpsAz = Number(p.inps_azienda) || 0;
    const tfrAcc = Number(p.tfr_accantonamento) || 0;
    const inail = Number(p.inail) || 0;

    const { error } = await supabase.from('payslips').upsert({
      employee_id: p.employee_id as string,
      month: `${p.month}-01`,
      ral: p.ral ? Number(p.ral) : null,
      lordo_mensile: lordo,
      netto_mensile: Number(p.netto_mensile) || 0,
      inps_dipendente: Number(p.inps_dipendente) || 0,
      irpef: Number(p.irpef) || 0,
      addizionale_regionale: Number(p.addizionale_regionale) || 0,
      addizionale_comunale: Number(p.addizionale_comunale) || 0,
      bonus_100: Number(p.bonus_100) || 0,
      straordinari: Number(p.straordinari) || 0,
      premi: Number(p.premi) || 0,
      trattenute_varie: Number(p.trattenute_varie) || 0,
      inps_azienda: inpsAz,
      tfr_accantonamento: tfrAcc,
      inail: inail,
      costo_totale_azienda: lordo + inpsAz + tfrAcc + inail,
      created_by: user.id,
    }, { onConflict: 'employee_id,month' });

    if (error) errors++;
    else saved++;
  }

  return { success: true, saved, errors };
}
