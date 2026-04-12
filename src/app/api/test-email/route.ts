export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendOutreachEmail } from '@/lib/email-outreach';

/**
 * TEST: Invia un'email di outreach di esempio per verificare template e SMTP.
 * POST /api/test-email
 * Solo admin.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const testEmail = (body as Record<string, string>).email || user.email;

  if (!testEmail) return NextResponse.json({ error: 'Nessuna email' }, { status: 400 });

  // Messaggio di esempio realistico
  const sampleMessage = `Oggetto: Ho dato un'occhiata alla vostra presenza online - posso aiutarvi

Buongiorno,

Ho trovato la vostra attivita' su Google Maps e devo dire che le recensioni dei vostri clienti parlano chiaro: siete un punto di riferimento nella zona con le vostre 4.5 stelle e oltre 120 recensioni. Complimenti davvero.

Pero' ho notato tre cose che vi stanno facendo perdere clienti ogni giorno:

Il vostro sito web non e' ottimizzato per i cellulari. Oggi il 75% delle persone cerca attivita' come la vostra dallo smartphone - se il sito non si vede bene, vanno dal concorrente in 3 secondi.

Non avete una presenza attiva su Instagram. Nella vostra zona, il 60% dei potenziali clienti sotto i 40 anni scopre nuove attivita' proprio su Instagram. Senza un profilo curato, state lasciando questi clienti ai concorrenti.

Non state facendo nessun tipo di pubblicita' online. I vostri concorrenti che investono anche solo 5-10 euro al giorno su Google o Instagram vi stanno portando via clienti ogni singolo giorno.

Vi propongo una cosa senza nessun impegno: un audit gratuito di 15 minuti dove vi mostro esattamente cosa migliorare e come. Niente vendite aggressive, solo numeri e fatti.

Ho 3 slot disponibili questa settimana. Se vi interessa, rispondete a questa email o chiamateci.

Un saluto,
Il team PiraWeb`;

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY non configurata. Vai su resend.com per creare un account gratuito.' }, { status: 500 });
    }

    await sendOutreachEmail({
      to: testEmail,
      businessName: 'Ristorante Da Mario (TEST)',
      messageBody: sampleMessage,
    });

    return NextResponse.json({
      success: true,
      sent_to: testEmail,
      message: 'Email di test inviata! Controlla la posta.',
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Errore invio',
      details: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
