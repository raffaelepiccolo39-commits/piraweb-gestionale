export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

/**
 * Debug endpoint to test Google API keys.
 * GET /api/prospects/test
 */
export async function GET() {
  const keys = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ? process.env.GOOGLE_PLACES_API_KEY.substring(0, 8) + '...' : 'NON IMPOSTATA',
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ? process.env.GOOGLE_MAPS_API_KEY.substring(0, 8) + '...' : 'NON IMPOSTATA',
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.substring(0, 8) + '...' : 'NON IMPOSTATA',
  };

  // Test each key with Places API (New)
  const results: Record<string, unknown> = { keys };

  const keysToTest = [
    { name: 'GOOGLE_PLACES_API_KEY', value: process.env.GOOGLE_PLACES_API_KEY },
    { name: 'GOOGLE_MAPS_API_KEY', value: process.env.GOOGLE_MAPS_API_KEY },
    { name: 'GOOGLE_AI_API_KEY', value: process.env.GOOGLE_AI_API_KEY },
  ].filter((k) => k.value);

  for (const key of keysToTest) {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key.value!,
          'X-Goog-FieldMask': 'places.displayName',
        },
        body: JSON.stringify({ textQuery: 'pizza roma', languageCode: 'it', maxResultCount: 1 }),
      });

      const data = await res.json();

      if (res.ok && data.places) {
        results[key.name] = {
          status: 'FUNZIONA',
          first_result: data.places[0]?.displayName?.text || 'OK',
        };
      } else {
        results[key.name] = {
          status: 'ERRORE',
          http_status: res.status,
          error: data.error?.message || JSON.stringify(data).substring(0, 200),
        };
      }
    } catch (e) {
      results[key.name] = {
        status: 'ERRORE',
        error: e instanceof Error ? e.message : 'unknown',
      };
    }
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
