export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getInvoiceStatus, getArubaConfigFromEnv, SDI_STATUS_MAP } from '@/lib/aruba/client';

/**
 * POST /api/invoices/sdi-status
 * Check the SDI status of a sent invoice.
 * Body: { invoice_id: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  if (!invoiceId) return NextResponse.json({ error: 'invoice_id obbligatorio' }, { status: 400 });

  const serviceClient = await createServiceRoleClient();

  const { data: invoice } = await serviceClient
    .from('invoices')
    .select('id, sdi_filename, sdi_status')
    .eq('id', invoiceId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 });
  }

  if (!invoice.sdi_filename) {
    return NextResponse.json({ error: 'Fattura non ancora inviata a SDI' }, { status: 400 });
  }

  const arubaConfig = getArubaConfigFromEnv();
  if (!arubaConfig) {
    return NextResponse.json({ error: 'Credenziali Aruba non configurate' }, { status: 500 });
  }

  try {
    const status = await getInvoiceStatus(arubaConfig, arubaConfig.username, invoice.sdi_filename);

    if (!status) {
      return NextResponse.json({ error: 'Stato non trovato su Aruba' }, { status: 404 });
    }

    // Map SDI status code to our status
    const mapped = SDI_STATUS_MAP[status.statusCode];
    const sdiStatus = mapped?.status || 'sent_to_sdi';
    const sdiLabel = mapped?.label || status.status;

    // Update invoice
    await serviceClient.from('invoices').update({
      sdi_status: sdiStatus,
      sdi_identifier: status.sdiIdentifier,
      sdi_message: sdiLabel,
    }).eq('id', invoiceId);

    return NextResponse.json({
      success: true,
      status: sdiStatus,
      label: sdiLabel,
      sdi_identifier: status.sdiIdentifier,
      filename: status.filename,
    });

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return NextResponse.json({ error: `Errore controllo stato: ${errorMsg}` }, { status: 500 });
  }
}
