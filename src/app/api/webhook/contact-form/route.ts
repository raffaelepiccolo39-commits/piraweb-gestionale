export const dynamic = 'force-dynamic';

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * POST /api/webhook/contact-form
 * Riceve i dati dal form di contatto di piraweb.it
 * e crea un deal nel CRM del gestionale.
 *
 * Pubblico ma protetto con API key.
 *
 * Body: { name, surname, email, phone?, service?, message, api_key }
 */
const allowedOrigins = ['https://www.piraweb.it', 'https://piraweb.it', 'http://localhost:3000'];

export async function POST(request: NextRequest) {
  // CORS per piraweb.it
  const origin = request.headers.get('origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : '';

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400, headers });
  }

  // Verifica API key
  const apiKey = typeof body.api_key === 'string' ? body.api_key : '';
  const expectedKey = process.env.CONTACT_FORM_API_KEY;

  if (!expectedKey || apiKey.length !== expectedKey.length || !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    return NextResponse.json({ error: 'API key non valida' }, { status: 401, headers });
  }

  // Estrai campi
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const surname = typeof body.surname === 'string' ? body.surname.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  // Il sito manda ancora la vecchia tassonomia: la si traduce in quella del
  // CRM (§3.2). Cambiare il sito sarebbe stato peggio — il form vive fuori
  // da qui e non si aggiorna nello stesso deploy.
  const SOURCE_DAL_SITO: Record<string, string> = {
    website: 'inbound', social_media: 'inbound', other: 'inbound',
    cold_outreach: 'outbound', event: 'evento', ads: 'paid',
    referral: 'referral',
  };
  const sourceGrezza = typeof body.source === 'string' ? body.source : 'website';
  const source = SOURCE_DAL_SITO[sourceGrezza] ?? 'inbound';
  const companyName = typeof body.company_name === 'string' ? body.company_name.trim() : '';

  if (!name || !email) {
    return NextResponse.json({ error: 'Nome e email obbligatori' }, { status: 400, headers });
  }

  const supabase = await createServiceRoleClient();

  // Trova l'admin come owner del deal
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  const adminId = admin?.id || '00000000-0000-0000-0000-000000000000';
  const fullName = `${name} ${surname}`.trim();

  const sourceLabel = source === 'paid' ? 'Lead ADV' : source === 'inbound' ? 'Richiesta da sito web' : `Lead ${source}`;

  // Crea il deal nel CRM
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .insert({
      title: `${sourceLabel} - ${fullName}`,
      company_name: companyName || null,
      contact_name: fullName,
      contact_email: email,
      contact_phone: phone || null,
      stage_id: 0,
      value: 0,
      probability: 20,
      source,
      // Un lead che entra da solo deve comunque avere una prossima azione,
      // altrimenti la V7 rifiuta l'inserimento e il form del sito smette di
      // funzionare senza che nessuno se ne accorga.
      prossima_azione: 'Primo contatto',
      data_prossima_azione: new Date().toISOString().slice(0, 10),
      services: service || null,
      notes: message ? (source === 'inbound' ? `Messaggio dal form:\n${message}` : message) : null,
      owner_id: adminId,
      created_by: adminId,
    })
    .select('id')
    .single();

  if (dealError) {
    await logError({ error: dealError, route: '/api/webhook/contact-form', source: 'api', context: { op: 'webhook-contact-form' } });
    return NextResponse.json({ error: 'Errore creazione deal' }, { status: 500, headers });
  }

  // Aggiungi attivita' al deal
  if (deal) {
    await supabase.from('crm_attivita').insert({
      deal_id: deal.id,
      tipo: 'nota',
      titolo: source === 'paid' ? 'Lead generato da campagna ADV' : 'Form compilato su piraweb.it',
      descrizione: `${fullName}${companyName ? ` (${companyName})` : ''}\n\nServizio richiesto: ${service || 'Non specificato'}\n\n${message || 'Nessun dettaglio'}`,
      owner_id: adminId,
      stato: 'completata',
      completed_at: new Date().toISOString(),
      origine: 'automazione',
    });
  }

  return NextResponse.json({ success: true, deal_id: deal?.id }, { status: 200, headers });
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : '';

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
