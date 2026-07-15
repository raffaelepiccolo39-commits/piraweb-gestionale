export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { logError } from '@/lib/logger';

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
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    await logError({ error: linkError, route: '/api/admin/resend-invite', source: 'api', context: { op: 'resend-invite-link' } });
    return NextResponse.json(
      { error: `Errore generazione link: ${linkError?.message || 'sconosciuto'}` },
      { status: 500 }
    );
  }

  const inviteLink = `${appUrl}/api/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=/onboarding`;

  try {
    await sendInviteEmail({
      to: target.email,
      fullName: target.full_name,
      role: target.role,
      inviteLink,
    });
  } catch (emailErr) {
    await logError({ error: emailErr, route: '/api/admin/resend-invite', source: 'api', context: { op: 'resend-invite-email' } });
    return NextResponse.json(
      { error: `Errore invio email: ${emailErr instanceof Error ? emailErr.message : 'sconosciuto'}`, inviteLink },
      { status: 500 }
    );
  }

  await logAudit({
    action: 'user.invite_resent',
    actorId: user.id,
    actorEmail: user.email,
    entityType: 'profile',
    entityId: userId,
    details: { targetEmail: target.email },
    request,
  });

  return NextResponse.json({ ok: true, inviteLink });
}
