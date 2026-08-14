export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/require-admin';
import { logError } from '@/lib/logger';

/**
 * Segna una generazione come pubblicata.
 *
 * È il controllo che evita l'errore umano (§6 della specifica): se l'etichetta
 * è RICHIESTA e non è stata applicata, la pubblicazione viene RIFIUTATA con
 * 409. Non si può pubblicare un deepfake o un testo di interesse pubblico
 * senza la disclosure prevista dall'art. 50.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  if (!(await isStaff(supabase, user.id))) return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });

  let body: { pubblicato?: boolean; canale?: string; etichetta_applicata?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const { data: gen } = await supabase
    .from('ai_generations')
    .select('esito_etichetta, etichetta_applicata')
    .eq('id', id)
    .maybeSingle();
  if (!gen) return NextResponse.json({ error: 'Generazione non trovata' }, { status: 404 });

  const etichettaApplicata = body.etichetta_applicata ?? gen.etichetta_applicata;
  const richiesta = String(gen.esito_etichetta).startsWith('RICHIESTA_');

  // Il blocco: pubblicazione richiesta, etichetta obbligatoria e non applicata.
  if (body.pubblicato && richiesta && !etichettaApplicata) {
    return NextResponse.json(
      {
        error: 'Questo contenuto richiede un\'etichetta di trasparenza (art. 50) prima della pubblicazione. Applicala e riprova.',
        codice: 'ETICHETTA_RICHIESTA',
      },
      { status: 409 },
    );
  }

  try {
    const { error } = await supabase.from('ai_generations').update({
      pubblicato: body.pubblicato ?? false,
      canale_pubblicazione: body.canale ?? null,
      etichetta_applicata: etichettaApplicata,
      data_pubblicazione: body.pubblicato ? new Date().toISOString() : null,
    }).eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logError({ error: err, route: '/api/ai-act/generazioni/pubblicazione', source: 'api', context: { id } });
    return NextResponse.json({ error: 'Aggiornamento non riuscito' }, { status: 500 });
  }
}
