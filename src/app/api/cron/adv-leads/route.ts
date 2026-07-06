export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * ADV LEADS — sync diretto Meta Lead Ads → CRM.
 * Ogni run chiama la Graph API del modulo lead, prende i lead nuovi
 * (dedup per email + source='ads') e crea i deal nel CRM.
 *
 * Env richieste:
 *   META_LEADS_TOKEN   — token Meta (System User) con permesso leads_retrieval
 *   META_LEAD_FORM_ID  — id del modulo lead (default: modulo contatti pira web)
 *   CRON_SECRET        — protezione cron (già presente)
 */
const GRAPH = 'https://graph.facebook.com/v21.0';

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }

function pick(fd: Array<{ name?: string; values?: string[] }>, keys: string[]): string {
  for (const k of keys) {
    const f = fd.find((x) => (x.name || '').toLowerCase() === k);
    if (f?.values?.[0]) return String(f.values[0]).trim();
  }
  for (const k of keys) {
    const f = fd.find((x) => (x.name || '').toLowerCase().includes(k));
    if (f?.values?.[0]) return String(f.values[0]).trim();
  }
  return '';
}

async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const token = process.env.META_LEADS_TOKEN;
  const formId = process.env.META_LEAD_FORM_ID || '1047814294438116';
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'META_LEADS_TOKEN non configurato' }, { status: 200 });
  }

  const supabase = await createServiceRoleClient();
  const { data: admin } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
  const adminId = admin?.id || '00000000-0000-0000-0000-000000000000';

  let created = 0, skipped = 0, failed = 0;
  let url: string = `${GRAPH}/${formId}/leads?fields=id,created_time,field_data,campaign_name,adset_name,ad_name,platform&limit=100&access_token=${encodeURIComponent(token)}`;

  try {
    for (let page = 0; page < 5 && url; page++) {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) {
        Sentry.captureMessage(`adv-leads Meta error: ${JSON.stringify(json.error)}`);
        return NextResponse.json({ ok: false, reason: 'Meta API', detail: json.error?.message }, { status: 200 });
      }

      for (const lead of (json.data || [])) {
        const fd = lead.field_data || [];
        const email = pick(fd, ['email']);
        const fullName = pick(fd, ['full_name', 'nome', 'name']);
        if (!email) { skipped++; continue; }

        const { data: exists } = await supabase
          .from('deals').select('id').eq('contact_email', email).eq('source', 'ads').limit(1);
        if (exists && exists.length) { skipped++; continue; }

        const phone = pick(fd, ['phone_number', 'telefono', 'phone']).replace(/^[a-z]:/i, '');
        const company = pick(fd, ["nome_dell'azienda", 'azienda', 'company']);
        const service = pick(fd, ['tipo_di_consulenza', 'servizio', 'service']).replace(/_/g, ' ').replace(/\|/g, ', ').trim();
        const city = pick(fd, ['città', 'citta', 'city']);
        const notes = [
          lead.campaign_name ? `Campagna: ${lead.campaign_name}` : '',
          lead.adset_name ? `Gruppo: ${lead.adset_name}` : '',
          lead.ad_name ? `Inserzione: ${lead.ad_name}` : '',
          lead.platform ? `Piattaforma: ${lead.platform}` : '',
          city ? `Città: ${city}` : '',
          lead.created_time ? `Data lead: ${lead.created_time}` : '',
        ].filter(Boolean).join('\n');

        const { data: deal, error } = await supabase.from('deals').insert({
          title: `Lead ADV - ${fullName || email}`,
          company_name: company || null,
          contact_name: fullName || email,
          contact_email: email,
          contact_phone: phone || null,
          stage: 'lead',
          value: 0,
          probability: 20,
          source: 'ads',
          services: service || null,
          notes: notes || null,
          owner_id: adminId,
          created_by: adminId,
        }).select('id').single();

        if (error) { failed++; continue; }
        if (deal) {
          await supabase.from('deal_activities').insert({
            deal_id: deal.id,
            type: 'note',
            title: 'Lead generato da campagna ADV',
            description: `${fullName || email}${company ? ` (${company})` : ''}\n\nServizio: ${service || 'Non specificato'}\n\n${notes}`,
            completed: true,
            created_by: adminId,
          });
          created++;
        }
      }

      url = json.paging?.next || '';
    }
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ ok: false, reason: 'errore sync', detail: String(e) }, { status: 200 });
  }

  return NextResponse.json({ ok: true, created, skipped, failed }, { status: 200 });
}
