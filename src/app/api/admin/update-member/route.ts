export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

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
      return NextResponse.json({ error: 'Errore aggiornamento ruolo' }, { status: 500 });
    }

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
      return NextResponse.json({ error: 'Errore aggiornamento stato' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'update_employee') {
    const salary = body.salary !== undefined && body.salary !== null && body.salary !== '' ? Number(body.salary) : null;
    const iban = typeof body.iban === 'string' && body.iban ? body.iban : null;
    const color = typeof body.color === 'string' && body.color ? body.color : null;
    const contractType = typeof body.contract_type === 'string' && body.contract_type ? body.contract_type : null;
    const contractStartDate = typeof body.contract_start_date === 'string' && body.contract_start_date ? body.contract_start_date : null;

    const { error } = await serviceClient
      .from('profiles')
      .update({
        salary,
        iban,
        color,
        contract_type: contractType,
        contract_start_date: contractStartDate,
      })
      .eq('id', targetUserId);

    if (error) {
      return NextResponse.json({ error: 'Errore aggiornamento dipendente' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Azione non valida' }, { status: 400 });
}
