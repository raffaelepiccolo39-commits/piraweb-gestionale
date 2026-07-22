export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { logError } from '@/lib/logger';

/**
 * POST /api/admin/update-member
 * Server-side admin-only endpoint for updating a team member's role, active status, or employee details.
 * Prevents privilege escalation by verifying admin role server-side.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  // Verify the caller is an admin (server-side check)
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!callerProfile || callerProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Solo gli admin possono eseguire questa operazione' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const targetUserId = typeof body.user_id === 'string' ? body.user_id : '';

  if (!targetUserId) {
    return NextResponse.json({ error: 'user_id obbligatorio' }, { status: 400 });
  }

  const serviceClient = await createServiceRoleClient();

  if (action === 'update_role') {
    const newRole = typeof body.role === 'string' ? body.role : '';
    const validRoles = ['admin', 'social_media_manager', 'content_creator', 'graphic_social', 'graphic_brand'];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json({ error: 'Ruolo non valido' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUserId);

    if (error) {
      await logError({ error, route: '/api/admin/update-member', source: 'api', context: { op: 'update-role' } });
      return NextResponse.json({ error: 'Errore aggiornamento ruolo' }, { status: 500 });
    }

    await logAudit({
      action: 'user.role_changed',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'profile',
      entityId: targetUserId,
      details: { newRole },
      request,
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'toggle_active') {
    const isActive = typeof body.is_active === 'boolean' ? body.is_active : true;

    // Prevent admin from deactivating themselves
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Non puoi disattivare te stesso' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('profiles')
      .update({ is_active: !isActive })
      .eq('id', targetUserId);

    if (error) {
      await logError({ error, route: '/api/admin/update-member', source: 'api', context: { op: 'toggle-active' } });
      return NextResponse.json({ error: 'Errore aggiornamento stato' }, { status: 500 });
    }

    await logAudit({
      action: !isActive ? 'user.activated' : 'user.deactivated',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'profile',
      entityId: targetUserId,
      request,
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'update_employee') {
    const salary = body.salary !== undefined && body.salary !== null && body.salary !== '' ? Number(body.salary) : null;
    const iban = typeof body.iban === 'string' && body.iban ? body.iban : null;
    const color = typeof body.color === 'string' && body.color ? body.color : null;
    const contractType = typeof body.contract_type === 'string' && body.contract_type ? body.contract_type : null;
    const contractStartDate = typeof body.contract_start_date === 'string' && body.contract_start_date ? body.contract_start_date : null;

    // Il colore resta in profiles (lo vede tutto il team sugli avatar); i
    // dati retributivi vanno nella tabella riservata.
    const { error: colorError } = await serviceClient
      .from('profiles')
      .update({ color })
      .eq('id', targetUserId);

    if (colorError) {
      await logError({ error: colorError, route: '/api/admin/update-member', source: 'api', context: { op: 'update-employee-color' } });
      return NextResponse.json({ error: 'Errore aggiornamento dipendente' }, { status: 500 });
    }

    const { error } = await serviceClient
      .from('employee_compensation')
      .upsert({
        profile_id: targetUserId,
        salary,
        iban,
        contract_type: contractType,
        contract_start_date: contractStartDate,
      }, { onConflict: 'profile_id' });

    if (error) {
      await logError({ error, route: '/api/admin/update-member', source: 'api', context: { op: 'update-employee' } });
      return NextResponse.json({ error: 'Errore aggiornamento dipendente' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'terminate_member') {
    // Licenziamento: blocca l'accesso per sempre (ban auth), disattiva il profilo,
    // libera le task aperte. Lo storico resta (nessuna cancellazione dati).
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Non puoi licenziare te stesso' }, { status: 400 });
    }

    // 1. Ban dell'utente auth (~100 anni) → non potrà più autenticarsi
    const { error: banError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: '876600h',
    });
    if (banError) {
      await logError({ error: banError, route: '/api/admin/update-member', source: 'api', context: { op: 'terminate-ban' } });
      return NextResponse.json({ error: 'Errore nel blocco dell\'accesso' }, { status: 500 });
    }

    // 2. Marca il profilo come licenziato + disattivato
    const { error: profError } = await serviceClient
      .from('profiles')
      .update({ is_active: false, terminated_at: new Date().toISOString() })
      .eq('id', targetUserId);
    if (profError) {
      await logError({ error: profError, route: '/api/admin/update-member', source: 'api', context: { op: 'terminate-profile' } });
      return NextResponse.json({ error: 'Errore aggiornamento profilo' }, { status: 500 });
    }

    // 3. Libera le sue task aperte (non archiviate e non completate)
    await serviceClient
      .from('tasks')
      .update({ assigned_to: null })
      .eq('assigned_to', targetUserId)
      .is('archived_at', null)
      .neq('status', 'done');

    await logAudit({
      action: 'user.terminated',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'profile',
      entityId: targetUserId,
      request,
    });

    return NextResponse.json({ success: true });
  }

  if (action === 'reinstate_member') {
    // Riassunzione: sblocca l'accesso e riattiva il profilo.
    const { error: unbanError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: 'none',
    });
    if (unbanError) {
      await logError({ error: unbanError, route: '/api/admin/update-member', source: 'api', context: { op: 'reinstate-unban' } });
      return NextResponse.json({ error: 'Errore nello sblocco dell\'accesso' }, { status: 500 });
    }

    const { error: profError } = await serviceClient
      .from('profiles')
      .update({ is_active: true, terminated_at: null })
      .eq('id', targetUserId);
    if (profError) {
      await logError({ error: profError, route: '/api/admin/update-member', source: 'api', context: { op: 'reinstate-profile' } });
      return NextResponse.json({ error: 'Errore aggiornamento profilo' }, { status: 500 });
    }

    await logAudit({
      action: 'user.reinstated',
      actorId: user.id,
      actorEmail: user.email,
      entityType: 'profile',
      entityId: targetUserId,
      request,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 });
}
