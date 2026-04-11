export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Search for businesses using Google Places API (New).
 * POST /api/prospects/search
 * Body: { query: "ristoranti Roma", city: "Roma", sector: "ristorazione" }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { query, city, sector } = await request.json();
  if (!query) return NextResponse.json({ error: 'Query obbligatoria' }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Nessuna chiave Google API configurata.' }, { status: 500 });
  }

  // Try Places API (New) first, then fallback to legacy
  let results: Record<string, unknown>[] = [];

  // ══════════ ATTEMPT 1: Places API (New) ══════════
  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'it',
          maxResultCount: 20,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.places && data.places.length > 0) {
        results = data.places.map((place: Record<string, unknown>) => ({
          business_name: (place.displayName as Record<string, string>)?.text || '',
          address: place.formattedAddress as string || '',
          city: city || extractCity((place.formattedAddress as string) || ''),
          sector: sector || '',
          google_place_id: place.id as string,
          google_rating: place.rating as number || null,
          google_reviews_count: place.userRatingCount as number || null,
          google_maps_url: place.googleMapsUri as string || null,
          website: place.websiteUri as string || null,
          phone: place.nationalPhoneNumber as string || null,
        }));
      }
    }
  } catch {
    // New API failed, try legacy
  }

  // ══════════ ATTEMPT 2: Legacy Places API ══════════
  if (results.length === 0) {
    try {
      const searchQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&language=it&key=${apiKey}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results) {
          results = data.results.map((place: Record<string, unknown>) => ({
            business_name: place.name as string,
            address: place.formatted_address as string,
            city: city || extractCity((place.formatted_address as string) || ''),
            sector: sector || '',
            google_place_id: place.place_id as string,
            google_rating: (place.rating as number) || null,
            google_reviews_count: (place.user_ratings_total as number) || null,
            google_maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            website: null,
            phone: null,
          }));

          // Fetch details for website/phone
          results = await Promise.all(
            results.slice(0, 20).map(async (place) => {
              try {
                const detailRes = await fetch(
                  `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.google_place_id}&fields=website,formatted_phone_number,url&language=it&key=${apiKey}`
                );
                const detailData = await detailRes.json();
                const r = detailData.result || {};
                return { ...place, website: r.website || null, phone: r.formatted_phone_number || null, google_maps_url: r.url || place.google_maps_url };
              } catch {
                return place;
              }
            })
          );
        } else if (data.status === 'REQUEST_DENIED') {
          return NextResponse.json({
            error: `Google API rifiutata: ${data.error_message || 'Verifica che la fatturazione sia abilitata sul progetto Google Cloud e che Places API sia attiva.'}`,
          }, { status: 500 });
        }
      }
    } catch {
      // Legacy also failed
    }
  }

  if (results.length === 0) {
    return NextResponse.json({
      error: 'Nessun risultato trovato. Verifica che Places API (New) sia abilitata su Google Cloud Console e che la fatturazione sia attiva sul progetto.',
    }, { status: 500 });
  }

  return NextResponse.json({ results, count: results.length });
}

function extractCity(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    const cityPart = parts[parts.length - 2] || '';
    return cityPart.replace(/^\d{5}\s*/, '').trim();
  }
  return '';
}
