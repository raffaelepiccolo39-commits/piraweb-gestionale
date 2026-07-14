export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * ADV LEADS — sync lead ADV → CRM. Due fonti supportate (in ordine):
 *   1) ADV_SHEET_CSV_URL — URL CSV di un Google Sheet "pubblicato sul web"
 *   2) META_LEADS_TOKEN  — token Meta (System User) con leads_retrieval
 * Dedup per email + source='ads'. Inerte se nessuna fonte è configurata.
 *
 * Env: ADV_SHEET_CSV_URL | META_LEADS_TOKEN | META_LEAD_FORM_ID | CRON_SECRET
 */
const GRAPH = 'https://graph.facebook.com/v21.0';

interface NormLead {
  email: string; fullName: string; phone: string; company: string;
  service: string; city: string; campaign: string; adset: string;
  ad: string; platform: string; created: string;
}

function norm(s: string): string { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// ── CSV parser (gestisce virgolette, virgole e a-capo nei campi) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function colIndex(headers: string[], cands: string[]): number {
  const H = headers.map(norm);
  for (const c of cands) { const n = norm(c); const i = H.indexOf(n); if (i >= 0) return i; }
  for (const c of cands) { const n = norm(c); const i = H.findIndex(h => h.includes(n)); if (i >= 0) return i; }
  return -1;
}

async function leadsFromCsv(url: string): Promise<NormLead[]> {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const h = rows[0];
  const idx = {
    email: colIndex(h, ['email', 'e-mail']),
    name: colIndex(h, ['full_name', 'nome', 'name']),
    phone: colIndex(h, ['phone_number', 'telefono', 'phone']),
    service: colIndex(h, ['tipo_di_consulenza', 'servizio', 'service']),
    company: colIndex(h, ["nome_dell'azienda", 'azienda', 'company']),
    city: colIndex(h, ['città', 'citta', 'city']),
    campaign: colIndex(h, ['campaign_name', 'campagna']),
    adset: colIndex(h, ['adset_name']),
    ad: colIndex(h, ['ad_name']),
    platform: colIndex(h, ['platform', 'piattaforma']),
    created: colIndex(h, ['created_time', 'data']),
  };
  const g = (r: string[], i: number) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '');
  return rows.slice(1).filter(r => r.length > 1).map(r => ({
    email: g(r, idx.email),
    fullName: g(r, idx.name),
    phone: g(r, idx.phone).replace(/^[a-z]:/i, ''),
    company: g(r, idx.company),
    service: g(r, idx.service).replace(/_/g, ' ').replace(/\|/g, ', ').trim(),
    city: g(r, idx.city),
    campaign: g(r, idx.campaign),
    adset: g(r, idx.adset),
    ad: g(r, idx.ad),
    platform: g(r, idx.platform),
    created: g(r, idx.created),
  }));
}

function pick(fd: Array<{ name?: string; values?: string[] }>, keys: string[]): string {
  for (const k of keys) { const f = fd.find(x => (x.name || '').toLowerCase() === k); if (f?.values?.[0]) return String(f.values[0]).trim(); }
  for (const k of keys) { const f = fd.find(x => (x.name || '').toLowerCase().includes(k)); if (f?.values?.[0]) return String(f.values[0]).trim(); }
  return '';
}

async function leadsFromMeta(token: string, formId: string): Promise<NormLead[]> {
  const out: NormLead[] = [];
  let url: string = `${GRAPH}/${formId}/leads?fields=id,created_time,field_data,campaign_name,adset_name,ad_name,platform&limit=100&access_token=${encodeURIComponent(token)}`;
  for (let page = 0; page < 5 && url; page++) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error?.message || 'Meta API error');
    for (const lead of (json.data || [])) {
      const fd = lead.field_data || [];
      out.push({
        email: pick(fd, ['email']),
        fullName: pick(fd, ['full_name', 'nome', 'name']),
        phone: pick(fd, ['phone_number', 'telefono', 'phone']).replace(/^[a-z]:/i, ''),
        company: pick(fd, ["nome_dell'azienda", 'azienda', 'company']),
        service: pick(fd, ['tipo_di_consulenza', 'servizio', 'service']).replace(/_/g, ' ').replace(/\|/g, ', ').trim(),
        city: pick(fd, ['città', 'citta', 'city']),
        campaign: lead.campaign_name || '', adset: lead.adset_name || '',
        ad: lead.ad_name || '', platform: lead.platform || '', created: lead.created_time || '',
      });
    }
    url = json.paging?.next || '';
  }
  return out;
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }

async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const csvUrl = process.env.ADV_SHEET_CSV_URL;
  const token = process.env.META_LEADS_TOKEN;
  const formId = process.env.META_LEAD_FORM_ID || '1047814294438116';
  if (!csvUrl && !token) {
    return NextResponse.json({ ok: false, reason: 'Nessuna fonte configurata (ADV_SHEET_CSV_URL o META_LEADS_TOKEN)' }, { status: 200 });
  }

  const supabase = await createServiceRoleClient();
  const { data: admin } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single();
  const adminId = admin?.id || '00000000-0000-0000-0000-000000000000';

  let leads: NormLead[] = [];
  try {
    leads = csvUrl ? await leadsFromCsv(csvUrl) : await leadsFromMeta(token as string, formId);
  } catch (e) {
    await logError({ error: e, route: '/api/cron/adv-leads', source: 'cron' });
    return NextResponse.json({ ok: false, reason: 'fetch fonte fallito', detail: String(e) }, { status: 200 });
  }

  let created = 0, skipped = 0, failed = 0;
  for (const L of leads) {
    if (!L.email) { skipped++; continue; }
    const { data: exists } = await supabase.from('deals').select('id').eq('contact_email', L.email).eq('source', 'ads').limit(1);
    if (exists && exists.length) { skipped++; continue; }

    const notes = [
      L.campaign ? `Campagna: ${L.campaign}` : '',
      L.adset ? `Gruppo: ${L.adset}` : '',
      L.ad ? `Inserzione: ${L.ad}` : '',
      L.platform ? `Piattaforma: ${L.platform}` : '',
      L.city ? `Città: ${L.city}` : '',
      L.created ? `Data lead: ${L.created}` : '',
    ].filter(Boolean).join('\n');

    const { data: deal, error } = await supabase.from('deals').insert({
      title: `Lead ADV - ${L.fullName || L.email}`,
      company_name: L.company || null,
      contact_name: L.fullName || L.email,
      contact_email: L.email,
      contact_phone: L.phone || null,
      stage: 'lead', value: 0, probability: 20, source: 'ads',
      services: L.service || null, notes: notes || null,
      owner_id: adminId, created_by: adminId,
    }).select('id').single();

    if (error) { failed++; continue; }
    if (deal) {
      await supabase.from('deal_activities').insert({
        deal_id: deal.id, type: 'note', title: 'Lead generato da campagna ADV',
        description: `${L.fullName || L.email}${L.company ? ` (${L.company})` : ''}\n\nServizio: ${L.service || 'Non specificato'}\n\n${notes}`,
        completed: true, created_by: adminId,
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, source: csvUrl ? 'csv' : 'meta', created, skipped, failed }, { status: 200 });
}
