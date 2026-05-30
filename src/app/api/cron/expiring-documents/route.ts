export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EMPLOYEE_DOCUMENT_TYPE_LABELS } from '@/lib/constants';

/**
 * EXPIRING DOCUMENTS CRON
 * Notifica al dipendente i propri documenti in scadenza a milestone fissi:
 *   - 30 giorni prima (primo avviso)
 *   - 7 giorni prima (secondo avviso)
 *   - 0 giorni (scadenza oggi)
 * Dedup tramite metadata.document_id + metadata.milestone: ogni documento
 * riceve al massimo 3 notifiche nella sua vita.
 *
 * Schedule: ogni giorno alle 8:00 UTC (~9-10 italiano).
 */

const MILESTONES = [30, 7, 0] as const;

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

  const supabase = await createServiceRoleClient();
  const today = new Date();
  let totalSent = 0;
  const errors: string[] = [];

  for (const days of MILESTONES) {
    const target = new Date(today);
    target.setDate(today.getDate() + days);
    const targetIso = target.toISOString().split('T')[0];

    const { data: docs, error: fetchErr } = await supabase
      .from('employee_documents')
      .select('id, user_id, title, type, expires_on')
      .eq('expires_on', targetIso)
      .limit(500);

    if (fetchErr) {
      errors.push(`fetch ${days}gg: ${fetchErr.message}`);
      continue;
    }
    if (!docs || docs.length === 0) continue;

    for (const doc of docs) {
      // Dedup: salta se abbiamo già notificato questo doc per questo milestone
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('type', 'document_expiring')
        .eq('user_id', doc.user_id)
        .contains('metadata', { document_id: doc.id, milestone: days })
        .limit(1);

      if (existing && existing.length > 0) continue;

      const typeLabel = EMPLOYEE_DOCUMENT_TYPE_LABELS[doc.type] || doc.type;
      const message =
        days === 0
          ? `${typeLabel} "${doc.title}" scade oggi`
          : `${typeLabel} "${doc.title}" scade tra ${days} giorni`;

      const { error: notifyErr } = await supabase.rpc('create_notification', {
        p_user_id: doc.user_id,
        p_type: 'document_expiring',
        p_title: 'Documento in scadenza',
        p_message: message,
        p_link: '/documenti',
        p_metadata: { document_id: doc.id, milestone: days },
      });

      if (notifyErr) {
        errors.push(`notify ${doc.id}: ${notifyErr.message}`);
      } else {
        totalSent++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    notifications_sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
