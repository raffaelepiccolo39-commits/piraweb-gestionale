export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Start Meta OAuth flow.
 * GET /api/meta/auth → redirects to Facebook login
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const appId = process.env.META_APP_ID;
  if (!appId) return NextResponse.json({ error: 'META_APP_ID non configurato' }, { status: 500 });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/meta/callback`;
  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'business_management',
  ].join(',');

  // Create a signed state to prevent CSRF: userId + HMAC signature
  const { createHmac } = await import('crypto');
  const secret = process.env.META_APP_SECRET || appId;
  const hmac = createHmac('sha256', secret).update(user.id).digest('hex').slice(0, 16);
  const state = `${user.id}.${hmac}`;

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;

  return NextResponse.redirect(authUrl);
}
