import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * true se l'utente è amministratore. Legge il proprio profilo, consentito da
 * RLS. Da usare nei route handler admin-only DOPO getUser(): il middleware
 * salta le /api, quindi il gate delle pagine non protegge gli endpoint.
 *
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
 *   if (!(await isAdmin(supabase, user.id)))
 *     return NextResponse.json({ error: 'Riservato agli amministratori' }, { status: 403 });
 */
export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return data?.role === 'admin';
}
