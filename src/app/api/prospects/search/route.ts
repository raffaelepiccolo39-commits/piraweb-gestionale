export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Search for businesses using Google Places API (New) with Maps Platform key.
 * POST /api/prospects/search
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { query, city, sector } = await request.json();
  if (!query) return NextResponse.json({ error: 'Query obbligatoria' }, { status: 400 });

  // Try all available Google API keys
  const keysToTry = [
    process.env.GOOGLE_PLACES_API_KEY,
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.GOOGLE_AI_API_KEY,
  ].filter(Boolean) as string[];

  if (keysToTry.length === 0) {
    return NextResponse.json({ error: 'Nessuna chiave Google API configurata.' }, { status: 500 });
  }

  // ══════════ Try Places API (New) with each key ══════════
  for (const apiKey of keysToTry) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.rating',
            'places.userRatingCount',
            'places.websiteUri',
            'places.nationalPhoneNumber',
            'places.googleMapsUri',
            'places.internationalPhoneNumber',
          ].join(','),
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'it',
          maxResultCount: 20,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.places && data.places.length > 0) {
          const results = data.places.map((place: Record<string, unknown>) => ({
            business_name: (place.displayName as Record<string, string>)?.text || '',
            address: (place.formattedAddress as string) || '',
            city: city || extractCity((place.formattedAddress as string) || ''),
            sector: sector || '',
            google_place_id: place.id as string,
            google_rating: (place.rating as number) || null,
            google_reviews_count: (place.userRatingCount as number) || null,
            google_maps_url: (place.googleMapsUri as string) || null,
            website: (place.websiteUri as string) || null,
            phone: (place.nationalPhoneNumber as string) || (place.internationalPhoneNumber as string) || null,
          }));
          return NextResponse.json({ results, count: results.length, source: 'google_places_new' });
        }
        // API worked but 0 results
        return NextResponse.json({ results: [], count: 0, source: 'google_places_new' });
      }

      // Check specific error
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = (errorData as Record<string, Record<string, string>>)?.error?.message || '';

      // If billing error or permission denied, try next key
      if (response.status === 403 || response.status === 401) {
        continue;
      }

      // Other error, return it
      return NextResponse.json({
        error: `Google Places API errore: ${errorMsg || response.statusText}. Assicurati che la fatturazione sia abilitata su Google Cloud Console.`,
      }, { status: 500 });

    } catch {
      continue; // Try next key
    }
  }

  // ══════════ All keys failed - try legacy Places API ══════════
  for (const apiKey of keysToTry) {
    try {
      const searchQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&language=it&key=${apiKey}`
      );

      if (!response.ok) continue;
      const data = await response.json();

      if (data.status === 'OK' && data.results?.length > 0) {
        // Fetch details for each
        const results = await Promise.all(
          (data.results as Record<string, unknown>[]).slice(0, 20).map(async (place) => {
            let website = null;
            let phone = null;
            let mapsUrl = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;

            try {
              const detailRes = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=website,formatted_phone_number,url&language=it&key=${apiKey}`
              );
              const detail = await detailRes.json();
              if (detail.result) {
                website = detail.result.website || null;
                phone = detail.result.formatted_phone_number || null;
                mapsUrl = detail.result.url || mapsUrl;
              }
            } catch { /* skip detail */ }

            return {
              business_name: place.name as string,
              address: (place.formatted_address as string) || '',
              city: city || extractCity((place.formatted_address as string) || ''),
              sector: sector || '',
              google_place_id: place.place_id as string,
              google_rating: (place.rating as number) || null,
              google_reviews_count: (place.user_ratings_total as number) || null,
              google_maps_url: mapsUrl,
              website,
              phone,
            };
          })
        );
        return NextResponse.json({ results, count: results.length, source: 'google_places_legacy' });
      }

      if (data.status === 'REQUEST_DENIED') {
        continue; // Try next key
      }
    } catch {
      continue;
    }
  }

  // ══════════ Everything failed - show debug info ══════════
  // Try one more time to get the exact error message
  let debugError = 'Nessun dettaglio disponibile';
  const debugKey = keysToTry[0];
  try {
    const debugRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': debugKey,
        'X-Goog-FieldMask': 'places.displayName',
      },
      body: JSON.stringify({ textQuery: 'pizza roma', languageCode: 'it', maxResultCount: 1 }),
    });
    const debugData = await debugRes.json();
    debugError = JSON.stringify(debugData).substring(0, 500);
  } catch (e) {
    debugError = e instanceof Error ? e.message : 'fetch failed';
  }

  return NextResponse.json({
    error: `Errore Google Places API. Dettaglio: ${debugError}`,
  }, { status: 500 });
}

function extractCity(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    const cityPart = parts[parts.length - 2] || '';
    return cityPart.replace(/^\d{5}\s*/, '').trim();
  }
  return '';
}
