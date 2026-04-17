import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Controlla se un utente ha la 2FA attiva (usato durante il login)
export async function POST(request: Request) {
  const { userId } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: 'userId richiesto' }, { status: 400 });
  }

  const serviceClient = await createServiceRoleClient();
  const { data: totp } = await serviceClient
    .from('user_totp')
    .select('enabled')
    .eq('user_id', userId)
    .eq('enabled', true)
    .single();

  return NextResponse.json({ enabled: !!totp });
}
