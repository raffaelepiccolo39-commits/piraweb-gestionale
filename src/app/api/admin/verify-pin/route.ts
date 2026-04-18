import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  const { pin } = await request.json();

  if (!pin || typeof pin !== 'string' || pin.length !== 6) {
    return NextResponse.json({ error: 'PIN non valido' }, { status: 400 });
  }

  const pinHash = createHash('sha256').update(pin).digest('hex');
  const storedHash = process.env.ADMIN_SECURITY_PIN_HASH;

  if (!storedHash) {
    return NextResponse.json({ error: 'PIN non configurato' }, { status: 500 });
  }

  if (pinHash !== storedHash) {
    return NextResponse.json({ valid: false, error: 'Codice errato' }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
