export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Search for businesses using Google Places API.
 * POST /api/prospects/search
 * Body: { query: "ristoranti Roma", city: "Roma", sector: "ristorazione" }
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  // Verify admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { query, city, sector } = await request.json();
  if (!query) return NextResponse.json({ error: 'Query obbligatoria' }, { status: 400 });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    // Log available env var names (not values) for debugging
    const envKeys = Object.keys(process.env).filter(k => k.includes('GOOGLE') || k.includes('PLACES')).join(', ');
    return NextResponse.json({
      error: `GOOGLE_PLACES_API_KEY non configurata. Variabili Google trovate: ${envKeys || 'nessuna'}. Aggiungi la chiave nelle variabili d'ambiente di Vercel e fai Redeploy.`
    }, { status: 500 });
  }

  try {
    // Use Google Places Text Search
    const searchQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${searchQuery}&language=it&key=${apiKey}`,
      { next: { revalidate: 0 } }
    );

    if (!response.ok) throw new Error('Google Places API error');
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return NextResponse.json({ error: `Google API: ${data.status}` }, { status: 500 });
    }

    const results = (data.results || []).map((place: Record<string, unknown>) => {
      const name = place.name as string;
      const address = place.formatted_address as string;
      const placeId = place.place_id as string;
      const rating = place.rating as number | undefined;
      const reviewCount = place.user_ratings_total as number | undefined;

      return {
        business_name: name,
        address,
        city: city || extractCity(address),
        sector: sector || '',
        google_place_id: placeId,
        google_rating: rating || null,
        google_reviews_count: reviewCount || null,
        google_maps_url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      };
    });

    // For each result, get details (website, phone) from Place Details
    const detailed = await Promise.all(
      results.slice(0, 20).map(async (place: Record<string, unknown>) => {
        try {
          const detailRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.google_place_id}&fields=website,formatted_phone_number,url&language=it&key=${apiKey}`
          );
          const detailData = await detailRes.json();
          const result = detailData.result || {};
          return {
            ...place,
            website: result.website || null,
            phone: result.formatted_phone_number || null,
            google_maps_url: result.url || place.google_maps_url,
          };
        } catch {
          return place;
        }
      })
    );

    return NextResponse.json({ results: detailed, count: detailed.length });
  } catch (err) {
    return NextResponse.json({ error: 'Errore nella ricerca' }, { status: 500 });
  }
}

function extractCity(address: string): string {
  // Try to extract city from Italian address format
  const parts = address.split(',').map((p) => p.trim());
  // Usually: "Via X, CAP Citta' Provincia, Italia"
  if (parts.length >= 2) {
    const cityPart = parts[parts.length - 2] || '';
    // Remove CAP (5 digits)
    return cityPart.replace(/^\d{5}\s*/, '').trim();
  }
  return '';
}
