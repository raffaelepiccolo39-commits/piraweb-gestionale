export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Meta OAuth callback.
 * GET /api/meta/callback?code=...&state=userId
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const stateParam = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');

  if (error || !code || !stateParam) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_error=auth_denied`);
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  // Verify HMAC-signed state to prevent CSRF
  const [userId, stateHmac] = stateParam.split('.');
  if (!userId || !stateHmac || !appSecret) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_error=invalid_state`);
  }

  const { createHmac } = await import('crypto');
  const expectedHmac = createHmac('sha256', appSecret).update(userId).digest('hex').slice(0, 16);
  if (stateHmac !== expectedHmac) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_error=invalid_state`);
  }

  // Also verify the current user session matches the state userId
  const authSupabase = await createServerSupabaseClient();
  const { data: { user: sessionUser } } = await authSupabase.auth.getUser();
  if (!sessionUser || sessionUser.id !== userId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_error=session_mismatch`);
  }
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/meta/callback`;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_error=config`);
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    // Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token || tokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // 60 days

    // Get user info
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${accessToken}`);
    const meData = await meRes.json();

    // Save connection
    const serviceClient = await createServiceRoleClient();
    const { data: connection } = await serviceClient.from('meta_connections').upsert({
      user_id: userId,
      access_token: accessToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      fb_user_id: meData.id,
      fb_user_name: meData.name,
    }, { onConflict: 'user_id' }).select().single();

    // Fetch pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();

    if (connection && pagesData.data) {
      for (const page of pagesData.data) {
        let igId = null;
        let igUsername = null;

        // Get Instagram business account if linked
        if (page.instagram_business_account) {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.instagram_business_account.id}?fields=username&access_token=${page.access_token}`
          );
          const igData = await igRes.json();
          igId = page.instagram_business_account.id;
          igUsername = igData.username || null;
        }

        await serviceClient.from('meta_pages').upsert({
          connection_id: connection.id,
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          instagram_business_id: igId,
          instagram_username: igUsername,
        }, { onConflict: 'page_id' });
      }
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_connected=true`);
  } catch {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/social-calendar?meta_error=token_exchange`);
  }
}
