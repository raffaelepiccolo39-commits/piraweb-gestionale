import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

// Ritorna lo stato 2FA dell'utente corrente (per la pagina settings)
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const serviceClient = await createServiceRoleClient();
  const { data: totp } = await serviceClient
    .from('user_totp')
    .select('enabled')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ enabled: totp?.enabled || false });
}
