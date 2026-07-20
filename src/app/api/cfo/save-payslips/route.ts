export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/require-admin';
import { logError } from '@/lib/logger';

/**
 * Salva le buste paga estratte dal PDF.
 * POST /api/cfo/save-payslips  Body: { payslips: [...] }
 *
 * Era una Server Action (`cfo/actions.ts`). Le Server Actions non
 * sopravvivono all'esportazione statica con cui si impacchetta l'app, e in
 * tutto il progetto ce n'erano solo due: l'altra duplicava una route che
 * esisteva già (/api/cfo/parse-payslip), questa no. Logica invariata.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Riservato agli amministratori' }, { status: 403 });
  }

  let body: { payslips?: Record<string, unknown>[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const payslips = body.payslips;
  if (!Array.isArray(payslips)) {
    return NextResponse.json({ error: 'payslips deve essere un elenco' }, { status: 400 });
  }

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

    if (error) {
      await logError({ error, route: '/api/cfo/save-payslips', source: 'api', context: { op: 'cfo-salva-payslip', employeeId: p.employee_id, month: p.month } });
      errors++;
    } else {
      saved++;
    }
  }

  return NextResponse.json({ success: true, saved, errors });
}
