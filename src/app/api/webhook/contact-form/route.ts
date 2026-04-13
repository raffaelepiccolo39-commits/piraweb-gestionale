export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/webhook/contact-form
 * Riceve i dati dal form di contatto di piraweb.it
 * e crea un deal nel CRM del gestionale.
 *
 * Pubblico ma protetto con API key.
 *
 * Body: { name, surname, email, phone?, service?, message, api_key }
 */
export async function POST(request: NextRequest) {
  // CORS per piraweb.it
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = ['https://www.piraweb.it', 'https://piraweb.it', 'http://localhost:3000'];
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

  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'API key non valida' }, { status: 401, headers });
  }

  // Estrai campi
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const surname = typeof body.surname === 'string' ? body.surname.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

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

  // Crea il deal nel CRM
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .insert({
      title: `Richiesta da sito web - ${fullName}`,
      company_name: null,
      contact_name: fullName,
      contact_email: email,
      contact_phone: phone || null,
      stage: 'lead',
      value: 0,
      probability: 20,
      source: 'website',
      services: service || null,
      notes: message ? `Messaggio dal form:\n${message}` : null,
      owner_id: adminId,
      created_by: adminId,
    })
    .select('id')
    .single();

  if (dealError) {
    return NextResponse.json({ error: 'Errore creazione deal' }, { status: 500, headers });
  }

  // Aggiungi attivita' al deal
  if (deal) {
    await supabase.from('deal_activities').insert({
      deal_id: deal.id,
      type: 'note',
      title: 'Form compilato su piraweb.it',
      description: `${fullName} ha compilato il modulo di contatto.\n\nServizio richiesto: ${service || 'Non specificato'}\n\nMessaggio: ${message || 'Nessun messaggio'}`,
      completed: true,
      created_by: adminId,
    });
  }

  return NextResponse.json({ success: true, deal_id: deal?.id }, { status: 200, headers });
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://www.piraweb.it',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
