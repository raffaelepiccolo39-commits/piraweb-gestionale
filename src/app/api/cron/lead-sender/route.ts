export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendOutreachEmail } from '@/lib/email-outreach';

/**
 * LEAD SENDER AGENT
 * Prende i lead con status 'to_contact' (messaggio gia' generato) con email
 * e invia l'email automaticamente. Aggiorna lo status a 'contacted'.
 * I lead senza email vengono saltati (WhatsApp e' disabilitato).
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
    let failed = 0;
    const results: Array<{ name: string; method: string; status: string }> = [];

    for (const lead of leads) {
      const message = lead.outreach_message as string;
      const email = lead.email as string | null;
      const businessName = lead.business_name as string;

      try {
        if (!email) {
          // Senza email non contattiamo: WhatsApp e' disabilitato. Riporta il lead a 'new' per eventuale ri-arricchimento.
          await supabase.from('lead_prospects').update({
            outreach_status: 'new',
          }).eq('id', lead.id);
          results.push({ name: businessName, method: 'nessuno', status: 'no_email' });
          failed++;
          continue;
        }

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
        results.push({ name: businessName, method: 'email', status: 'inviata' });

      } catch (err) {
        failed++;
        results.push({
          name: businessName,
          method: 'email',
          status: `errore: ${err instanceof Error ? err.message : 'sconosciuto'}`,
        });
      }
    }

    await supabase.from('agent_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      leads_contacted: emailsSent,
      details: {
        emails_sent: emailsSent,
        failed,
        results,
      },
    }).eq('id', runId);

    return NextResponse.json({
      success: true,
      agent: 'lead_sender',
      emails_sent: emailsSent,
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

