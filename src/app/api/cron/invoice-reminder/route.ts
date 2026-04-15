export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendInvoiceReminder, generateWhatsAppReminderLink } from '@/lib/email-invoice';

/**
 * INVOICE REMINDER CRON
 * Controlla le fatture scadute da 10+ giorni e non pagate.
 * Invia un reminder via email al cliente.
 * Se il cliente ha un telefono, genera anche un link WhatsApp per l'admin.
 *
 * Schedule: ogni giorno alle 9:00
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

  const supabase = await createServiceRoleClient();

  // Find invoices that are:
  // - status 'sent' or 'overdue'
  // - NOT paid
  // - due_date is 10+ days ago
  // - no reminder sent in the last 7 days (avoid spamming)
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const tenDaysAgoStr = tenDaysAgo.toISOString().split('T')[0];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString();

  const { data: overdueInvoices, error: fetchError } = await supabase
    .from('invoices')
    .select('*, client:clients(id, name, company, ragione_sociale, email, phone)')
    .in('status', ['sent', 'overdue'])
    .lte('due_date', tenDaysAgoStr)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${sevenDaysAgoStr}`)
    .limit(20);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    return NextResponse.json({ success: true, reminders_sent: 0, message: 'Nessuna fattura scaduta da notificare' });
  }

  let emailsSent = 0;
  let whatsappLinks: string[] = [];
  const errors: string[] = [];

  for (const invoice of overdueInvoices) {
    const client = invoice.client as {
      id: string; name: string; company: string | null;
      ragione_sociale: string | null; email: string | null; phone: string | null;
    } | null;

    if (!client) continue;

    const clientName = client.ragione_sociale || client.company || client.name;
    const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000);

    // Mark as overdue if still 'sent'
    if (invoice.status === 'sent') {
      await supabase.from('invoices').update({ status: 'overdue' }).eq('id', invoice.id);
    }

    // Send email reminder if client has email
    if (client.email) {
      try {
        await sendInvoiceReminder({
          to: client.email,
          clientName,
          invoiceNumber: invoice.invoice_number,
          total: invoice.total,
          dueDate: invoice.due_date,
          daysOverdue,
        });
        emailsSent++;
      } catch (err) {
        errors.push(`Email ${invoice.invoice_number}: ${err instanceof Error ? err.message : 'errore'}`);
      }
    }

    // Generate WhatsApp link if client has phone
    if (client.phone) {
      const link = generateWhatsAppReminderLink(
        client.phone,
        clientName,
        invoice.invoice_number,
        invoice.total,
        daysOverdue,
      );
      whatsappLinks.push(link);
    }

    // Update reminder timestamp
    await supabase.from('invoices').update({
      reminder_sent_at: new Date().toISOString(),
      reminder_count: (invoice.reminder_count || 0) + 1,
    }).eq('id', invoice.id);
  }

  // Notify admin with WhatsApp links if any
  if (whatsappLinks.length > 0) {
    const { data: admin } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (admin) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        title: `${overdueInvoices.length} fatture scadute`,
        message: `Inviate ${emailsSent} email di reminder. ${whatsappLinks.length} clienti da contattare su WhatsApp.`,
        type: 'alert',
      });
    }
  }

  return NextResponse.json({
    success: true,
    invoices_checked: overdueInvoices.length,
    emails_sent: emailsSent,
    whatsapp_ready: whatsappLinks.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
