export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Get connected Meta pages and Instagram accounts.
 * GET /api/meta/pages
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: pages } = await supabase
    .from('meta_pages')
    .select('*, client:clients(id, name, company)')
    .eq('is_active', true)
    .order('page_name');

  const { data: connection } = await supabase
    .from('meta_connections')
    .select('fb_user_name, token_expires_at')
    .maybeSingle();

  return NextResponse.json({
    connected: !!connection,
    user_name: connection?.fb_user_name || null,
    token_expires: connection?.token_expires_at || null,
    pages: pages || [],
  });
}
