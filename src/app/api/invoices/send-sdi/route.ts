export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { uploadInvoice, getArubaConfigFromEnv } from '@/lib/aruba/client';
import { generateFatturapaXml, generateFatturapaFilename, type FatturapaData } from '@/lib/aruba/fatturapa';

/**
 * POST /api/invoices/send-sdi
 * Generates FatturaPA XML and sends it to Aruba/SDI.
 * Body: { invoice_id: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Verify admin role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Solo gli admin possono inviare fatture a SDI' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : '';
  if (!invoiceId) return NextResponse.json({ error: 'invoice_id obbligatorio' }, { status: 400 });

  const serviceClient = await createServiceRoleClient();

  // Fetch invoice with client and items
  const { data: invoice, error: invError } = await serviceClient
    .from('invoices')
    .select('*, client:clients(*), items:invoice_items(*)')
    .eq('id', invoiceId)
    .single();

  if (invError || !invoice) {
    return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 });
  }

  if (invoice.sdi_status === 'sent_to_sdi' || invoice.sdi_status === 'delivered') {
    return NextResponse.json({ error: 'Fattura gia inviata a SDI' }, { status: 400 });
  }

  const client = invoice.client;
  if (!client) {
    return NextResponse.json({ error: 'Cliente non trovato' }, { status: 400 });
  }

  if (!client.partita_iva && !client.codice_fiscale) {
    return NextResponse.json({ error: 'Il cliente deve avere Partita IVA o Codice Fiscale' }, { status: 400 });
  }

  const items = (invoice.items || []) as { description: string; quantity: number; unit_price: number; total: number }[];
  if (items.length === 0) {
    return NextResponse.json({ error: 'La fattura deve avere almeno una voce' }, { status: 400 });
  }

  // Get Aruba config
  const arubaConfig = getArubaConfigFromEnv();
  if (!arubaConfig) {
    return NextResponse.json({
      error: 'Credenziali Aruba non configurate. Aggiungi ARUBA_FE_USERNAME e ARUBA_FE_PASSWORD nelle variabili d\'ambiente.',
    }, { status: 500 });
  }

  // Seller info (PiraWeb)
  const sellerPIVA = process.env.PIRAWEB_PARTITA_IVA || '04891370613';

  // Build FatturaPA data
  const fatturaData: FatturapaData = {
    seller: {
      denominazione: process.env.PIRAWEB_RAGIONE_SOCIALE || 'Pira Web S.R.L.',
      partita_iva: sellerPIVA,
      codice_fiscale: process.env.PIRAWEB_CODICE_FISCALE || sellerPIVA,
      regime_fiscale: process.env.PIRAWEB_REGIME_FISCALE || 'RF01',
      indirizzo: process.env.PIRAWEB_INDIRIZZO || 'Via Roma 1',
      cap: process.env.PIRAWEB_CAP || '81030',
      comune: process.env.PIRAWEB_COMUNE || 'Casapesenna',
      provincia: process.env.PIRAWEB_PROVINCIA || 'CE',
      nazione: 'IT',
    },
    buyer: {
      denominazione: client.ragione_sociale || client.company || client.name,
      partita_iva: client.partita_iva,
      codice_fiscale: client.codice_fiscale,
      codice_sdi: client.codice_sdi,
      pec: client.pec,
      indirizzo: client.indirizzo,
      cap: client.cap,
      comune: client.citta,
      provincia: client.provincia,
      nazione: 'IT',
    },
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    description: invoice.description,
    items: items.map(item => ({
      descrizione: item.description,
      quantita: item.quantity,
      prezzo_unitario: item.unit_price,
      prezzo_totale: item.total,
      aliquota_iva: invoice.vat_rate,
    })),
    imponibile: invoice.subtotal,
    aliquota_iva: invoice.vat_rate,
    imposta: invoice.vat_amount,
    totale: invoice.total,
    payment_method: invoice.payment_method || 'MP05', // Bonifico bancario
  };

  try {
    // Generate XML
    const xml = generateFatturapaXml(fatturaData);
    const xmlBase64 = Buffer.from(xml, 'utf-8').toString('base64');

    // Generate filename
    const filename = generateFatturapaFilename(sellerPIVA, invoice.invoice_number.replace(/\D/g, ''));

    // Upload to Aruba
    const result = await uploadInvoice(arubaConfig, xmlBase64, sellerPIVA);

    // Update invoice with SDI info
    await serviceClient.from('invoices').update({
      sdi_status: 'sent_to_sdi',
      sdi_filename: result.uploadFileName || filename,
      sdi_sent_at: new Date().toISOString(),
      sdi_message: `Inviata con successo - ${result.uploadFileName}`,
      status: invoice.status === 'draft' ? 'sent' : invoice.status,
    }).eq('id', invoiceId);

    return NextResponse.json({
      success: true,
      filename: result.uploadFileName,
      message: 'Fattura inviata a SDI con successo',
    });

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';

    // Update invoice with error
    await serviceClient.from('invoices').update({
      sdi_status: 'error',
      sdi_message: errorMsg,
    }).eq('id', invoiceId);

    return NextResponse.json({ error: `Errore invio SDI: ${errorMsg}` }, { status: 500 });
  }
}
