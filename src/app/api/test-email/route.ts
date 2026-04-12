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

  const sampleMessage = `Gentile titolare,

Mi chiamo Raffaele Antonio Piccolo e sono il fondatore di PiraWeb, un'agenzia digitale con sede a Casapesenna che supporta le imprese italiane nella crescita online.

Abbiamo analizzato la presenza digitale della vostra attivita' e abbiamo individuato alcune aree dove potreste ottenere risultati importanti con interventi mirati.

Il vostro sito web attualmente non e' ottimizzato per i dispositivi mobili. Considerando che oltre il 75% degli utenti oggi naviga da smartphone, questo significa che la maggior parte dei potenziali clienti non riesce a visualizzare correttamente i vostri contenuti e abbandona il sito entro pochi secondi.

La vostra presenza sui social media e' attualmente limitata. Non abbiamo rilevato un profilo Instagram attivo, che rappresenta oggi il canale principale attraverso cui le attivita' locali acquisiscono nuovi clienti nella fascia 18-45 anni.

Non risultano campagne pubblicitarie attive su Google o Meta. I vostri concorrenti nella zona stanno investendo in visibilita' online e intercettano i clienti che potrebbero raggiungere voi.

Sulla base di questa analisi, vi offriamo un audit gratuito e approfondito della vostra presenza digitale, della durata di circa 15 minuti, in cui vi mostreremo nel dettaglio le opportunita' di crescita e le azioni concrete da intraprendere.

Rimaniamo a disposizione per fissare un incontro senza alcun impegno.`;

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY non configurata.' }, { status: 500 });
    }

    await sendOutreachEmail({
      to: testEmail,
      businessName: 'Ristorante Da Mario',
      messageBody: sampleMessage,
      subject: 'Report Analisi Digitale - Ristorante Da Mario',
      scores: {
        website: 35,
        social: 15,
        advertising: 0,
        seo: 55,
        content: 20,
        total: 25,
      },
      businessData: {
        city: 'Aversa',
        sector: 'Ristorazione',
        website: 'www.ristorantedamario.it',
        rating: 4.5,
        reviews: 127,
        hasInstagram: false,
        hasFacebook: true,
        hasTiktok: false,
      },
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
