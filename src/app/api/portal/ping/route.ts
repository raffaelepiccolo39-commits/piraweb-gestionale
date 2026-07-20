export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Registra il passaggio di un cliente nel portale (last_login_at).
 *
 * Serve una route perché il cliente NON può scrivere sulla propria riga di
 * client_portal_users: la sua policy è di sola lettura, e va bene così —
 * altrimenti potrebbe riattivarsi un accesso revocato.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const serviceClient = await createServiceRoleClient();
  // Il filtro su is_active evita di "tenere vivo" un accesso revocato.
  await serviceClient
    .from('client_portal_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id)
    .eq('is_active', true);

  return NextResponse.json({ ok: true });
}
