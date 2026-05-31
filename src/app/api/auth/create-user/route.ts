export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendInviteEmail } from '@/lib/email';
import type { UserRole } from '@/types/database';

const VALID_ROLES: UserRole[] = ['admin', 'social_media_manager', 'content_creator', 'graphic_social', 'graphic_brand'];

function generateRandomPassword(): string {
  return randomBytes(24).toString('base64url');
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Solo gli amministratori possono creare utenti' }, { status: 403 });
  }

  const { email, full_name, role, salary, iban, contract_type, contract_start_date } = await request.json();

  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'Email, nome e ruolo sono obbligatori' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 });
  }

  const serviceClient = await createServiceRoleClient();

  // Random placeholder password — l'utente la sostituirà al primo accesso
  const placeholderPassword = generateRandomPassword();

  const { data: newUser, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password: placeholderPassword,
    email_confirm: true,
  });

  if (authError) {
    const message = authError.message.includes('already been registered')
      ? 'Esiste già un utente con questa email'
      : `Errore nella creazione: ${authError.message}`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: profileError } = await serviceClient
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      email,
      full_name,
      role,
      salary: salary || null,
      iban: iban || null,
      contract_type: contract_type || null,
      contract_start_date: contract_start_date || null,
      must_change_password: true,
      onboarded_at: null,
    }, { onConflict: 'id' });

  if (profileError) {
    return NextResponse.json(
      { error: `Utente creato ma errore profilo: ${profileError.message}` },
      { status: 400 }
    );
  }

  // Genera link invito Supabase che porta a /onboarding
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let inviteLink = `${appUrl}/login`;
  try {
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/api/auth/callback?next=/onboarding` },
    });
    if (!linkError && linkData?.properties?.action_link) {
      inviteLink = linkData.properties.action_link;
    }
  } catch {
    // fallback su /login se la generazione fallisce
  }

  try {
    await sendInviteEmail({
      to: email,
      fullName: full_name,
      role,
      inviteLink,
    });
  } catch (emailError) {
    console.error('Failed to send invite email:', emailError);
  }

  return NextResponse.json(
    { user: newUser.user, inviteLink },
    { status: 201 }
  );
}
