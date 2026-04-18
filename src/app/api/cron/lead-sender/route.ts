export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendOutreachEmail, generateWhatsAppLink } from '@/lib/email-outreach';

/**
 * LEAD SENDER AGENT
 * Prende i lead con status 'to_contact' (messaggio gia' generato) e:
 * - Se ha email -> invia email automaticamente
 * - Se ha telefono -> genera link WhatsApp e notifica l'admin
 * Aggiorna lo status a 'contacted'.
 *
 * Schedule: ogni giorno alle 11:00, dopo che outreach ha generato i messaggi
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Controlla orario: solo lun-ven 9:00-18:00 (fuso orario Italia)
  const now = new Date();
  const italyFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = italyFormatter.formatToParts(now);
  const dayStr = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const weekendDays = ['Sat', 'Sun'];
  const dayOfWeek = weekendDays.includes(dayStr) ? (dayStr === 'Sun' ? 0 : 6) : 1;

  if (dayOfWeek === 0 || dayOfWeek === 6 || hour < 9 || hour >= 18) {
    return NextResponse.json({
      success: true,
      agent: 'lead_sender',
      skipped: true,
      reason: `Fuori orario lavorativo (${now.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })})`,
    });
  }

  const supabase = await createServiceRoleClient();
  const runId = crypto.randomUUID();

  await supabase.from('agent_runs').insert({
    id: runId,
    agent: 'lead_sender',
    status: 'running',
  });

  try {
    // Prendi lead pronti per l'invio
    const { data: leads, error: fetchError } = await supabase
      .from('lead_prospects')
      .select('*')
      .eq('outreach_status', 'to_contact')
      .not('outreach_message', 'is', null)
      .is('outreach_sent_at', null)
      .order('score_total', { ascending: true })
      .limit(20); // Max 20 invii per run (accelerato da 10)

    if (fetchError) throw new Error(`Errore fetch leads: ${fetchError.message}`);
    if (!leads || leads.length === 0) {
      await supabase.from('agent_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        leads_contacted: 0,
        details: { message: 'Nessun lead da inviare' },
      }).eq('id', runId);

      return NextResponse.json({ success: true, agent: 'lead_sender', sent: 0 });
    }

    // Claim leads: mark as 'sending' to prevent concurrent runs from sending duplicate emails
    const leadIds = leads.map(l => l.id);
    await supabase
      .from('lead_prospects')
      .update({ outreach_status: 'sending' })
      .in('id', leadIds);

    let emailsSent = 0;
    let whatsappReady = 0;
    let failed = 0;
    const results: Array<{ name: string; method: string; status: string }> = [];

    for (const lead of leads) {
      const message = lead.outreach_message as string;
      const email = lead.email as string | null;
      const phone = lead.phone as string | null;
      const channel = lead.outreach_channel as string;
      const businessName = lead.business_name as string;

      try {
        if (channel === 'email' && email) {
          // ── Invio Email ──
          await sendOutreachEmail({
            to: email,
            businessName,
            messageBody: message,
            scores: {
              website: lead.score_website as number || 0,
              social: lead.score_social as number || 0,
              advertising: lead.score_advertising as number || 0,
              seo: lead.score_seo as number || 0,
              content: lead.score_content as number || 0,
              total: lead.score_total as number || 0,
            },
            businessData: {
              city: lead.city as string || undefined,
              sector: lead.sector as string || undefined,
              website: lead.website as string || undefined,
              rating: lead.google_rating as number || undefined,
              reviews: lead.google_reviews_count as number || undefined,
              hasInstagram: !!(lead.instagram_url),
              hasFacebook: !!(lead.facebook_url),
              hasTiktok: !!(lead.tiktok_url),
            },
          });

          await supabase.from('lead_prospects').update({
            outreach_status: 'contacted',
            outreach_sent_at: new Date().toISOString(),
          }).eq('id', lead.id);

          emailsSent++;
          results.push({ name: businessName, method: 'email', status: 'inviata' });

        } else if (channel === 'whatsapp' && phone) {
          // ── WhatsApp: genera link e segna come pronto ──
          const waLink = generateWhatsAppLink(phone, message);

          await supabase.from('lead_prospects').update({
            outreach_status: 'contacted',
            outreach_sent_at: new Date().toISOString(),
            whatsapp_link: waLink,
          }).eq('id', lead.id);

          whatsappReady++;
          results.push({ name: businessName, method: 'whatsapp', status: 'link_generato' });

        } else if (email) {
          // Ha email ma canale diverso -> invia email comunque
          await sendOutreachEmail({
            to: email,
            businessName,
            messageBody: message,
            scores: {
              website: lead.score_website as number || 0,
              social: lead.score_social as number || 0,
              advertising: lead.score_advertising as number || 0,
              seo: lead.score_seo as number || 0,
              content: lead.score_content as number || 0,
              total: lead.score_total as number || 0,
            },
            businessData: {
              city: lead.city as string || undefined,
              sector: lead.sector as string || undefined,
              website: lead.website as string || undefined,
              rating: lead.google_rating as number || undefined,
              reviews: lead.google_reviews_count as number || undefined,
              hasInstagram: !!(lead.instagram_url),
              hasFacebook: !!(lead.facebook_url),
              hasTiktok: !!(lead.tiktok_url),
            },
          });

          await supabase.from('lead_prospects').update({
            outreach_status: 'contacted',
            outreach_channel: 'email',
            outreach_sent_at: new Date().toISOString(),
          }).eq('id', lead.id);

          emailsSent++;
          results.push({ name: businessName, method: 'email_fallback', status: 'inviata' });

        } else if (phone) {
          // Ha solo telefono -> genera WhatsApp link
          const waLink = generateWhatsAppLink(phone, message);

          await supabase.from('lead_prospects').update({
            outreach_status: 'contacted',
            outreach_channel: 'whatsapp',
            outreach_sent_at: new Date().toISOString(),
            whatsapp_link: waLink,
          }).eq('id', lead.id);

          whatsappReady++;
          results.push({ name: businessName, method: 'whatsapp_fallback', status: 'link_generato' });

        } else {
          // Nessun contatto -> salta
          results.push({ name: businessName, method: 'nessuno', status: 'no_contatto' });
          failed++;
        }

      } catch (err) {
        failed++;
        results.push({
          name: businessName,
          method: channel,
          status: `errore: ${err instanceof Error ? err.message : 'sconosciuto'}`,
        });
      }
    }

    // Se ci sono link WhatsApp pronti, notifica l'admin via email
    if (whatsappReady > 0) {
      await notifyAdminWhatsApp(supabase, results.filter(r => r.method.includes('whatsapp')));
    }

    await supabase.from('agent_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      leads_contacted: emailsSent + whatsappReady,
      details: {
        emails_sent: emailsSent,
        whatsapp_ready: whatsappReady,
        failed,
        results,
      },
    }).eq('id', runId);

    return NextResponse.json({
      success: true,
      agent: 'lead_sender',
      emails_sent: emailsSent,
      whatsapp_ready: whatsappReady,
      failed,
    });

  } catch (err) {
    await supabase.from('agent_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err instanceof Error ? err.message : 'Errore sconosciuto',
    }).eq('id', runId);

    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore sconosciuto',
      agent: 'lead_sender',
    }, { status: 500 });
  }
}

/**
 * Invia un'email di riepilogo all'admin con i link WhatsApp pronti da cliccare.
 */
async function notifyAdminWhatsApp(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  waResults: Array<{ name: string; method: string; status: string }>
) {
  try {
    // Trova l'email dell'admin
    const { data: admin } = await supabase
      .from('profiles')
      .select('id, email:id')
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!admin) return;

    // Prendi i lead con whatsapp_link appena generati
    const { data: waLeads } = await supabase
      .from('lead_prospects')
      .select('business_name, city, phone, whatsapp_link, score_total')
      .not('whatsapp_link', 'is', null)
      .eq('outreach_status', 'contacted')
      .order('outreach_sent_at', { ascending: false })
      .limit(waResults.length);

    if (!waLeads || waLeads.length === 0) return;

    // Prendi l'email dell'admin da auth
    const { data: authUser } = await supabase.auth.admin.getUserById(admin.id);
    const adminEmail = authUser?.user?.email;
    if (!adminEmail) return;

    const { sendOutreachEmail: sendEmail } = await import('@/lib/email-outreach');

    const leadsList = waLeads
      .map(l => `- ${l.business_name} (${l.city}) - Score: ${l.score_total}/100\n  Clicca per inviare: ${l.whatsapp_link}`)
      .join('\n\n');

    await sendEmail({
      to: adminEmail,
      businessName: 'PiraWeb',
      subject: `${waLeads.length} messaggi WhatsApp pronti da inviare`,
      messageBody: `Ciao,\n\nGli agenti hanno preparato ${waLeads.length} messaggi WhatsApp per potenziali clienti.\nClicca sui link qui sotto per aprire WhatsApp con il messaggio gia' scritto:\n\n${leadsList}\n\nBuon lavoro!\nI tuoi agenti PiraWeb`,
    });

  } catch {
    // Notifica non critica
  }
}
