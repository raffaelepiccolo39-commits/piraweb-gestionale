export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { full_name, avatar_url } = body as { full_name?: string; avatar_url?: string };

  const service = await createServiceRoleClient();

  // Verifica che la password sia stata cambiata (precondizione)
  const { data: prof } = await service
    .from('profiles')
    .select('must_change_password, role')
    .eq('id', user.id)
    .single();

  if (!prof) {
    return NextResponse.json({ error: 'Profilo non trovato' }, { status: 404 });
  }
  if (prof.must_change_password) {
    return NextResponse.json({ error: 'Devi prima impostare una password' }, { status: 400 });
  }

  // La 2FA non è più parte dell'onboarding: si attiva dalla pagina dedicata
  // (/sicurezza-2fa, MFA nativo Supabase). Il vecchio blocco su user_totp
  // custom qui avrebbe impedito il completamento con un sistema ormai dismesso.

  const update: Record<string, unknown> = { onboarded_at: new Date().toISOString() };
  if (typeof full_name === 'string' && full_name.trim().length > 0) update.full_name = full_name.trim();
  if (typeof avatar_url === 'string') update.avatar_url = avatar_url || null;

  const { error } = await service.from('profiles').update(update).eq('id', user.id);
  if (error) {
    await logError({ error, route: '/api/onboarding/complete', source: 'api', context: { op: 'onboarding-complete' } });
    return NextResponse.json({ error: `Errore completamento onboarding: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
