export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendOutreachEmail } from '@/lib/email-outreach';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const testEmail = (body as Record<string, string>).email || user.email;

  if (!testEmail) return NextResponse.json({ error: 'Nessuna email' }, { status: 400 });

  const sampleMessage = `Buongiorno,

mi chiamo Raffaele Antonio Piccolo, sono ingegnere e fondatore di PiraWeb, un'agenzia digitale con sede a Casapesenna. Mi occupo di supportare le imprese del territorio nella crescita online.

Ho avuto modo di analizzare la presenza digitale della vostra attivita' utilizzando i nostri strumenti di analisi professionale, e ho pensato di condividere con voi i risultati perche' credo possano esservi utili.

Dall'analisi emerge che il vostro sito web presenta alcune carenze tecniche: non risulta ottimizzato per i dispositivi mobili, il che significa che oltre il 70% dei vostri potenziali clienti, che oggi naviga prevalentemente da smartphone, potrebbe abbandonare il sito dopo pochi secondi. Inoltre manca un certificato SSL, un elemento che Google considera essenziale per il posizionamento nei risultati di ricerca.

Un'altra area su cui potreste lavorare e' la presenza sui social media. Non abbiamo rilevato un profilo Instagram attivo per la vostra attivita'. In un settore come il vostro, Instagram rappresenta oggi uno dei canali piu' efficaci per farsi conoscere da nuovi clienti nella zona, soprattutto nella fascia 25-45 anni.

Infine, non risultano campagne pubblicitarie attive su Google o sui social. Anche con un investimento contenuto, nell'ordine di 5-10 euro al giorno, e' possibile raggiungere centinaia di persone che cercano esattamente i servizi che offrite.

Se volete, sono disponibile per una consulenza gratuita di 15 minuti in cui vi mostro nel dettaglio i risultati e le possibili azioni da intraprendere. Nessun impegno, semplicemente un confronto tra professionisti.`;

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY non configurata.' }, { status: 500 });
    }

    await sendOutreachEmail({
      to: testEmail,
      businessName: 'Ristorante Da Mario',
      messageBody: sampleMessage,
      subject: 'Analisi digitale gratuita per Ristorante Da Mario',
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
    }, { status: 500 });
  }
}
