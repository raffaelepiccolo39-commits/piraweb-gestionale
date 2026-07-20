export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/require-admin';

/**
 * Pagine Facebook e account Instagram collegati.
 * GET /api/meta/pages
 *
 * La lettura di meta_pages è admin-only lato RLS perché la tabella contiene
 * page_access_token in chiaro. Qui però serve a tutto il team per pubblicare,
 * quindi si legge con il service role DOPO aver verificato che chi chiede sia
 * del team — e si restituiscono solo campi innocui.
 *
 * Il token non compare nella risposta: prima si faceva select('*') e finiva
 * dritto nel browser di chiunque fosse loggato.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Un cliente del portale è autenticato quanto un dipendente: non basta più
  // sapere che c'è una sessione.
  if (!(await isStaff(supabase, user.id))) {
    return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });
  }

  const serviceClient = await createServiceRoleClient();

  const { data: connection } = await serviceClient
    .from('meta_connections')
    .select('id, fb_user_name, token_expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ connected: false, user_name: null, token_expires: null, pages: [] });
  }

  const { data: pages } = await serviceClient
    .from('meta_pages')
    .select('id, page_name, instagram_username, instagram_business_id, is_active, client_id, client:clients(id, name, company)')
    .eq('connection_id', connection.id)
    .eq('is_active', true)
    .order('page_name');

  return NextResponse.json({
    connected: true,
    user_name: connection.fb_user_name,
    token_expires: connection.token_expires_at,
    pages: pages || [],
  });
}
