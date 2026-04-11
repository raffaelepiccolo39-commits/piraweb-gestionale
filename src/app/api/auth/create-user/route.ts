export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendWelcomeEmail } from '@/lib/email';
import type { UserRole } from '@/types/database';

const VALID_ROLES: UserRole[] = ['admin', 'social_media_manager', 'content_creator', 'graphic_social', 'graphic_brand'];

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  // Verify caller is admin
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Solo gli amministratori possono creare utenti' }, { status: 403 });
  }

  const { email, password, full_name, role, salary, iban, contract_type, contract_start_date } = await request.json();

  if (!email || !password || !full_name || !role) {
    return NextResponse.json({ error: 'Tutti i campi sono obbligatori' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'La password deve avere almeno 8 caratteri' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 });
  }

  const serviceClient = await createServiceRoleClient();

  // Create auth user without metadata to avoid trigger issues
  const { data: newUser, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    const message = authError.message.includes('already been registered')
      ? 'Esiste già un utente con questa email'
      : `Errore nella creazione: ${authError.message}`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Insert profile manually using service role (bypasses RLS)
  // The trigger may have created a default profile, so we upsert
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
    }, { onConflict: 'id' });

  if (profileError) {
    return NextResponse.json(
      { error: `Utente creato ma errore profilo: ${profileError.message}` },
      { status: 400 }
    );
  }

  // Generate a password reset link so the user sets their own password
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let resetLink = `${appUrl}/login`;
  try {
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/dashboard` },
    });
    if (!linkError && linkData?.properties?.action_link) {
      resetLink = linkData.properties.action_link;
    }
  } catch {
    // If link generation fails, fall back to login URL
  }

  // Send welcome email with reset link (no password in email)
  try {
    await sendWelcomeEmail({
      to: email,
      fullName: full_name,
      email,
      role,
      resetLink,
    });
  } catch (emailError) {
    // User created successfully, email failed - don't block
    console.error('Failed to send welcome email:', emailError);
  }

  return NextResponse.json({ user: newUser.user }, { status: 201 });
}
