export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { inviaPush, pushAttive } from '@/lib/push';
import { logError } from '@/lib/logger';

/**
 * Il ponte tra il database e i telefoni.
 *
 * Le notifiche nascono in una quarantina di punti diversi — cron, pagine,
 * trigger Postgres — e agganciarsi a tutti sarebbe una promessa che prima o
 * poi qualcuno dimentica di mantenere. Ci si aggancia invece a valle: il
 * database, quando scrive una riga in `notifications`, chiama questa rotta.
 * Un punto solo, e chi domani aggiungera' una notifica avra' la push gratis.
 *
 * Protetta da un segreto suo (PUSH_HOOK_SECRET), non da quello dei cron:
 * chiamanti diversi, chiavi diverse — ruotarne una non spegne le altre.
 */
export async function POST(request: NextRequest) {
  const segreto = process.env.PUSH_HOOK_SECRET;
  if (!segreto || request.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  if (!pushAttive()) {
    // Chiavi non ancora configurate: non e' un errore, e' un impianto spento.
    return NextResponse.json({ saltato: 'push non configurate' });
  }

  try {
    const corpo = await request.json();
    const { user_id, title, message, link } = corpo ?? {};

    if (!user_id || !title) {
      return NextResponse.json({ error: 'Servono user_id e title' }, { status: 400 });
    }

    const esito = await inviaPush(user_id, {
      titolo: String(title),
      testo: message ? String(message) : '',
      link: link ? String(link) : null,
    });

    return NextResponse.json(esito);
  } catch (err) {
    await logError({ error: err, source: 'server', route: '/api/push/send' });
    return NextResponse.json({ error: 'Invio fallito' }, { status: 500 });
  }
}
