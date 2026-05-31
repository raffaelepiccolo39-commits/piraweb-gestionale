export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 });
  }

  const { userId } = await request.json();
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId mancante' }, { status: 400 });
  }

  const service = await createServiceRoleClient();
  const { data: target } = await service
    .from('profiles')
    .select('email, full_name, role, onboarded_at')
    .eq('id', userId)
    .single();

  if (!target) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  }
  if (target.onboarded_at) {
    return NextResponse.json({ error: 'Utente ha già completato l\'onboarding' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
    options: { redirectTo: `${appUrl}/api/auth/callback?next=/onboarding` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: `Errore generazione link: ${linkError?.message || 'sconosciuto'}` },
      { status: 500 }
    );
  }

  try {
    await sendInviteEmail({
      to: target.email,
      fullName: target.full_name,
      role: target.role,
      inviteLink: linkData.properties.action_link,
    });
  } catch (emailErr) {
    return NextResponse.json(
      { error: `Errore invio email: ${emailErr instanceof Error ? emailErr.message : 'sconosciuto'}`, inviteLink: linkData.properties.action_link },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, inviteLink: linkData.properties.action_link });
}
