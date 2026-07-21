export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendMessaggioClienteEmail } from '@/lib/email-portal';
import { getAppOrigin } from '@/lib/app-origin';
import { logError } from '@/lib/logger';

/**
 * Avvisa il team che è arrivato un messaggio dal portale.
 *
 * Il gestionale non ha notifiche push: senza questa email il messaggio
 * resterebbe fermo finché qualcuno non apre per caso la scheda del cliente.
 * Un canale a cui non si risponde è peggio di un canale che non c'è.
 *
 * Non riceve parametri di proposito: legge l'ultimo messaggio scritto da chi
 * sta chiamando. Così il contenuto dell'email non può essere dettato dalla
 * richiesta — al massimo si rimanda un avviso su un messaggio già proprio.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const service = await createServiceRoleClient();

  const { data: portale } = await service
    .from('client_portal_users')
    .select('client_id, full_name, email, client:clients(name, company)')
    .eq('id', user.id)
    .maybeSingle();

  if (!portale) return NextResponse.json({ error: 'Non è un accesso portale' }, { status: 403 });

  const { data: ultimo } = await service
    .from('client_messages')
    .select('id, testo, allegati, created_at')
    .eq('client_id', portale.client_id)
    .eq('portal_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultimo) return NextResponse.json({ ok: true, inviata: false });

  // Solo se è appena arrivato: una seconda chiamata sullo stesso messaggio
  // (un retry, un doppio tocco) non deve produrre una seconda email.
  const eta = Date.now() - new Date(ultimo.created_at).getTime();
  if (eta > 2 * 60 * 1000) return NextResponse.json({ ok: true, inviata: false });

  const { data: admin } = await service
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq('is_active', true);

  const destinatari = (admin || []).map((a) => a.email).filter(Boolean) as string[];
  if (destinatari.length === 0) return NextResponse.json({ ok: true, inviata: false });

  const cliente = portale.client as unknown as { name: string | null; company: string | null } | null;
  const testo = (ultimo.testo || '').trim();

  try {
    await sendMessaggioClienteEmail({
      to: destinatari,
      clientName: cliente?.company || cliente?.name || 'Cliente',
      chi: portale.full_name || portale.email,
      estratto: testo.length > 400
        ? `${testo.slice(0, 400)}…`
        : testo || '(solo allegati)',
      quantiAllegati: (ultimo.allegati || []).length,
      link: `${await getAppOrigin()}/clients/scheda?id=${portale.client_id}`,
    });
  } catch (error) {
    // Il messaggio è già salvato: se l'email non parte, il cliente non deve
    // vedere un errore su qualcosa che è andato a buon fine.
    logError({
      error,
      route: '/api/portal/messaggio-inviato',
      context: { clientId: portale.client_id, messaggioId: ultimo.id },
    });
    return NextResponse.json({ ok: true, inviata: false });
  }

  return NextResponse.json({ ok: true, inviata: true });
}
