export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendPortalInviteEmail } from '@/lib/email-portal';
import { logAudit } from '@/lib/audit';
import { logError } from '@/lib/logger';

/**
 * Accessi al portale clienti.
 *
 * Ricalca /api/auth/create-user (invito dipendenti) con UNA differenza
 * fondamentale: NON deve nascere nessuna riga in `profiles`. È quella riga
 * che public.is_staff() usa per distinguere il team dai clienti, e da cui
 * dipende l'intera separazione dei dati introdotta con la 20260720b.
 *
 * Il trigger handle_new_user della 00001 (che creerebbe un profilo a ogni
 * registrazione) risulta NON attivo in produzione — verificato il 20/07 con
 * un utente di prova. Non ci fidiamo comunque: dopo la creazione ripuliamo
 * l'eventuale profilo, così se quel trigger tornasse attivo non ci
 * ritroveremmo clienti promossi a dipendenti in silenzio.
 */

function generateRandomPassword(): string {
  return randomBytes(24).toString('base64url');
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo gli amministratori possono gestire gli accessi al portale' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const actor = auth.user!;

  const { client_id, email, full_name } = await request.json();
  if (!client_id || !email) {
    return NextResponse.json({ error: 'Cliente ed email sono obbligatori' }, { status: 400 });
  }

  const serviceClient = await createServiceRoleClient();

  const { data: client } = await serviceClient
    .from('clients')
    .select('id, name, company')
    .eq('id', client_id)
    .single();

  if (!client) {
    return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 });
  }

  const { data: newUser, error: authError } = await serviceClient.auth.admin.createUser({
    email,
    password: generateRandomPassword(),
    email_confirm: true,
  });

  if (authError) {
    await logError({ error: authError, route: 'portal/access', source: 'api', context: { op: 'create-auth-user', email, client_id } });
    const message = authError.message.includes('already been registered')
      ? 'Esiste già un utente con questa email. Se è un tuo collaboratore, non può usare lo stesso indirizzo per il portale.'
      : `Errore nella creazione: ${authError.message}`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const userId = newUser.user.id;

  // Rete di sicurezza: questo utente NON deve essere del team.
  const { data: strayProfile } = await serviceClient
    .from('profiles')
    .delete()
    .eq('id', userId)
    .select('id');

  if (strayProfile && strayProfile.length > 0) {
    // Il trigger è tornato attivo: va saputo, non è normale.
    await logError({
      error: new Error('handle_new_user ha creato un profilo per un utente del portale'),
      route: 'portal/access',
      source: 'api',
      context: { op: 'stray-profile-removed', userId, email },
    });
  }

  const { error: linkError } = await serviceClient
    .from('client_portal_users')
    .insert({
      id: userId,
      client_id,
      email,
      full_name: full_name || null,
      created_by: actor.id,
    });

  if (linkError) {
    // Senza il legame l'account è orfano e inutile: si rimuove.
    await serviceClient.auth.admin.deleteUser(userId);
    await logError({ error: linkError, route: 'portal/access', source: 'api', context: { op: 'insert-portal-user', userId, client_id } });
    return NextResponse.json({ error: `Errore nel collegamento al cliente: ${linkError.message}` }, { status: 400 });
  }

  // Link di primo accesso: stessa meccanica degli inviti dipendenti
  // (token_hash -> /api/auth/confirm), ma atterra nel portale.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  let inviteLink = `${appUrl}/login`;
  try {
    const { data: linkData, error: genError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (!genError && linkData?.properties?.hashed_token) {
      inviteLink = `${appUrl}/api/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=/portale/benvenuto`;
    }
  } catch {
    // fallback su /login
  }

  let emailSent = true;
  let emailError: string | null = null;
  try {
    await sendPortalInviteEmail({
      to: email,
      fullName: full_name || '',
      clientName: client.company || client.name,
      inviteLink,
    });
  } catch (err) {
    emailSent = false;
    emailError = err instanceof Error ? err.message : 'invio email fallito';
    await logError({ error: err, route: 'portal/access', source: 'api', context: { op: 'send-portal-invite', email, userId } });
  }

  await logAudit({
    action: 'portal_access.created',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'client',
    entityId: client_id,
    details: { email, full_name, portal_user_id: userId },
    request,
  });

  return NextResponse.json({ id: userId, inviteLink, emailSent, emailError }, { status: 201 });
}

/** Revoca o riattiva un accesso senza distruggere l'account. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const actor = auth.user!;

  const { id, is_active, resend } = await request.json();
  const serviceClient = await createServiceRoleClient();

  // Rimanda l'invito. Serve perché il link di primo accesso scade: finché il
  // cliente non ha scelto una password quello è l'unico modo di entrare, e
  // senza questo pulsante l'unica via d'uscita era cancellare e ricreare
  // l'accesso.
  if (resend === true) {
    const { data: pu } = await serviceClient
      .from('client_portal_users')
      .select('email, full_name, client:clients(name, company)')
      .eq('id', id)
      .maybeSingle();

    if (!pu) return NextResponse.json({ error: 'Accesso non trovato' }, { status: 404 });

    const row = pu as unknown as { email: string; full_name: string | null; client: { name: string; company: string | null } | null };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { data: linkData, error: genError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email: row.email,
    });
    if (genError || !linkData?.properties?.hashed_token) {
      await logError({ error: genError ?? new Error('link non generato'), route: 'portal/access', source: 'api', context: { op: 'resend', id } });
      return NextResponse.json({ error: 'Non è stato possibile generare il link' }, { status: 400 });
    }

    try {
      await sendPortalInviteEmail({
        to: row.email,
        fullName: row.full_name || '',
        clientName: row.client?.company || row.client?.name || '',
        inviteLink: `${appUrl}/api/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=/portale/benvenuto`,
      });
    } catch (err) {
      await logError({ error: err, route: 'portal/access', source: 'api', context: { op: 'resend-email', id } });
      return NextResponse.json({ error: 'Link generato ma email non inviata' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, resent: true });
  }

  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 });
  }
  const { error } = await serviceClient
    .from('client_portal_users')
    .update({ is_active })
    .eq('id', id);

  if (error) {
    await logError({ error, route: 'portal/access', source: 'api', context: { op: 'toggle-access', id, is_active } });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAudit({
    action: is_active ? 'portal_access.restored' : 'portal_access.revoked',
    actorId: actor.id,
    actorEmail: actor.email,
    entityType: 'client',
    entityId: id,
    details: { portal_user_id: id },
    request,
  });

  return NextResponse.json({ ok: true });
}
