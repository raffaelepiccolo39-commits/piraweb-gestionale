export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * Scarica il PDF del proprio contratto.
 *
 * Il bucket "contracts" è privato e le sue policy sono admin-only, quindi
 * l'attachment_url salvato in tabella (un getPublicUrl) non si apre da solo:
 * senza questa route il cliente vedeva le condizioni ma non poteva avere il
 * documento, e la pagina finiva con "scrivici e te la mandiamo".
 *
 * L'autorizzazione NON è riscritta qui: si legge il contratto con il client
 * dell'utente, quindi è l'RLS a decidere se quella riga è sua. Se non lo è,
 * la SELECT torna vuota e qui arriva un 404. Il service role entra in gioco
 * solo dopo, per firmare — mai per decidere chi può.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: contratto } = await supabase
    .from('client_contracts')
    .select('id, attachment_url, attachment_name')
    .eq('id', id)
    .maybeSingle();

  if (!contratto?.attachment_url) {
    return NextResponse.json({ error: 'Contratto non disponibile' }, { status: 404 });
  }

  // L'URL salvato è nella forma .../object/public/contracts/<path>: al bucket
  // serve il solo <path>. Un file caricato prima con un percorso diverso non
  // deve produrre un link firmato a caso, quindi se il prefisso manca si esce.
  const marcatore = '/contracts/';
  const taglio = contratto.attachment_url.indexOf(marcatore);
  if (taglio === -1) {
    logError({
      error: new Error('attachment_url senza il prefisso /contracts/'),
      route: '/api/portal/contratto/[id]',
      context: { contrattoId: id, attachmentUrl: contratto.attachment_url },
    });
    return NextResponse.json({ error: 'Contratto non disponibile' }, { status: 404 });
  }
  const percorso = decodeURIComponent(contratto.attachment_url.slice(taglio + marcatore.length));

  const service = await createServiceRoleClient();
  const { data: firmato, error } = await service.storage
    .from('contracts')
    .createSignedUrl(percorso, 60, {
      download: contratto.attachment_name || 'contratto.pdf',
    });

  if (error || !firmato) {
    logError({
      error,
      route: '/api/portal/contratto/[id]',
      context: { contrattoId: id, percorso },
    });
    return NextResponse.json({ error: 'Contratto non disponibile' }, { status: 404 });
  }

  return NextResponse.redirect(firmato.signedUrl);
}
