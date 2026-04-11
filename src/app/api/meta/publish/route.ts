export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Publish or schedule a post to Facebook/Instagram via Meta Graph API.
 * POST /api/meta/publish
 * Body: { page_id (meta_pages.id), platform, message, media_url?, scheduled_at?, social_post_id? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const rateLimit = checkRateLimit(`meta-publish:${user.id}`, { maxRequests: 30, windowSeconds: 3600 });
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Troppe pubblicazioni. Riprova tra poco.' }, { status: 429 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const { page_id, platform, message, media_url, scheduled_at, social_post_id } = body as {
    page_id: string; platform: string; message: string; media_url?: string; scheduled_at?: string; social_post_id?: string;
  };

  if (!page_id || !platform || !message) {
    return NextResponse.json({ error: 'page_id, platform e message sono obbligatori' }, { status: 400 });
  }

  // Get page data
  const { data: page } = await supabase.from('meta_pages').select('*').eq('id', page_id).single();
  if (!page) return NextResponse.json({ error: 'Pagina Meta non trovata' }, { status: 404 });

  const pageToken = page.page_access_token;
  let metaPostId = '';
  let error = '';

  try {
    if (platform === 'facebook') {
      // ══════════ PUBLISH TO FACEBOOK PAGE ══════════
      const fbBody: Record<string, string> = { message, access_token: pageToken };

      if (scheduled_at) {
        // Schedule for later
        const publishTime = Math.floor(new Date(scheduled_at).getTime() / 1000);
        fbBody.published = 'false';
        fbBody.scheduled_publish_time = String(publishTime);
      }

      if (media_url) {
        // Photo post
        const res = await fetch(`https://graph.facebook.com/v21.0/${page.page_id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fbBody, url: media_url }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        metaPostId = data.post_id || data.id || '';
      } else {
        // Text post
        const res = await fetch(`https://graph.facebook.com/v21.0/${page.page_id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fbBody),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        metaPostId = data.id || '';
      }

    } else if (platform === 'instagram') {
      // ══════════ PUBLISH TO INSTAGRAM ══════════
      if (!page.instagram_business_id) {
        return NextResponse.json({ error: 'Nessun account Instagram Business collegato a questa pagina' }, { status: 400 });
      }

      if (media_url) {
        // Step 1: Create media container
        const containerBody: Record<string, string> = {
          caption: message,
          image_url: media_url,
          access_token: pageToken,
        };

        const containerRes = await fetch(
          `https://graph.facebook.com/v21.0/${page.instagram_business_id}/media`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(containerBody) }
        );
        const containerData = await containerRes.json();
        if (containerData.error) throw new Error(containerData.error.message);

        // Step 2: Publish the container
        const publishRes = await fetch(
          `https://graph.facebook.com/v21.0/${page.instagram_business_id}/media_publish`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creation_id: containerData.id, access_token: pageToken }),
          }
        );
        const publishData = await publishRes.json();
        if (publishData.error) throw new Error(publishData.error.message);
        metaPostId = publishData.id || '';
      } else {
        return NextResponse.json({
          error: 'Instagram richiede almeno un\'immagine per pubblicare. Aggiungi un URL immagine.',
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Platform deve essere "facebook" o "instagram"' }, { status: 400 });
    }

    // Save scheduled post record
    await supabase.from('meta_scheduled_posts').insert({
      social_post_id: social_post_id || null,
      meta_page_id: page_id,
      platform,
      message,
      media_url: media_url || null,
      scheduled_at: scheduled_at || null,
      published_at: scheduled_at ? null : new Date().toISOString(),
      meta_post_id: metaPostId,
      status: scheduled_at ? 'scheduled' : 'published',
      created_by: user.id,
    });

    // Update social_post status if linked
    if (social_post_id) {
      await supabase.from('social_posts').update({
        status: scheduled_at ? 'scheduled' : 'published',
        published_at: scheduled_at ? null : new Date().toISOString(),
      }).eq('id', social_post_id);
    }

    return NextResponse.json({
      success: true,
      meta_post_id: metaPostId,
      status: scheduled_at ? 'scheduled' : 'published',
    });

  } catch (err) {
    error = err instanceof Error ? err.message : 'Errore sconosciuto';

    // Log failure
    await supabase.from('meta_scheduled_posts').insert({
      social_post_id: social_post_id || null,
      meta_page_id: page_id,
      platform,
      message,
      media_url: media_url || null,
      status: 'failed',
      error_message: error,
      created_by: user.id,
    });

    return NextResponse.json({ error: `Errore Meta API: ${error}` }, { status: 500 });
  }
}
