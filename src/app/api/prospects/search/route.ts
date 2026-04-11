export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Search for businesses using AI (Gemini/Claude) to find local businesses.
 * Falls back to Google Places API if available.
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

  const searchText = query.trim();

  // ══════════ Strategy 1: Google Places API (New) ══════════
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (placesKey) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri',
        },
        body: JSON.stringify({ textQuery: searchText, languageCode: 'it', maxResultCount: 20 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.places && data.places.length > 0) {
          const results = data.places.map((place: Record<string, unknown>) => ({
            business_name: (place.displayName as Record<string, string>)?.text || '',
            address: place.formattedAddress as string || '',
            city: city || '',
            sector: sector || '',
            google_place_id: place.id as string,
            google_rating: place.rating as number || null,
            google_reviews_count: place.userRatingCount as number || null,
            google_maps_url: place.googleMapsUri as string || null,
            website: place.websiteUri as string || null,
            phone: place.nationalPhoneNumber as string || null,
          }));
          return NextResponse.json({ results, count: results.length, source: 'google_places' });
        }
      }
    } catch {
      // Places API failed, continue to AI search
    }
  }

  // ══════════ Strategy 2: AI-powered search (Gemini) ══════════
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    try {
      const results = await searchWithGemini(searchText, city, sector, geminiKey);
      if (results.length > 0) {
        return NextResponse.json({ results, count: results.length, source: 'gemini_ai' });
      }
    } catch {
      // Gemini failed, try Claude
    }
  }

  // ══════════ Strategy 3: AI-powered search (Claude) ══════════
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (claudeKey) {
    try {
      const results = await searchWithClaude(searchText, city, sector, claudeKey);
      if (results.length > 0) {
        return NextResponse.json({ results, count: results.length, source: 'claude_ai' });
      }
    } catch {
      // Claude failed too
    }
  }

  return NextResponse.json({
    error: 'Nessun risultato trovato. Verifica la connessione o prova con termini diversi.',
  }, { status: 500 });
}

// ══════════════════════════════════════════════════════
// AI Search Functions
// ══════════════════════════════════════════════════════

const AI_PROMPT = (query: string, city: string, sector: string) => `Cerca attività commerciali reali per questa ricerca: "${query}"

Trova 15-20 attività REALI (non inventate) di tipo "${sector || query}" nella città di "${city || 'Italia'}".

Per ogni attività fornisci le informazioni che conosci. Rispondi ESCLUSIVAMENTE con un array JSON valido, senza markdown, senza backtick, solo JSON puro:
[
  {
    "business_name": "Nome Reale Attività",
    "address": "Via Example 123, Città",
    "phone": "+39 081 1234567 oppure null",
    "website": "https://www.example.com oppure null",
    "google_rating": 4.2,
    "google_reviews_count": 150,
    "instagram_url": "https://instagram.com/example oppure null",
    "facebook_url": "https://facebook.com/example oppure null",
    "notes": "breve descrizione dell'attività"
  }
]

IMPORTANTE:
- Fornisci SOLO attività che esistono realmente
- Se non conosci un dato metti null
- Il rating deve essere tra 1.0 e 5.0 o null
- Includi sito web e social media se li conosci
- Rispondi SOLO con il JSON, nient'altro`;

async function searchWithGemini(query: string, city: string, sector: string, apiKey: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: AI_PROMPT(query, city, sector) }] }],
        generationConfig: { maxOutputTokens: 4000, temperature: 0.1 },
      }),
    }
  );

  if (!response.ok) throw new Error('Gemini API error');

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return parseAIResults(text, city, sector);
}

async function searchWithClaude(query: string, city: string, sector: string, apiKey: string): Promise<Record<string, unknown>[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: AI_PROMPT(query, city, sector) }],
    }),
  });

  if (!response.ok) throw new Error('Claude API error');

  const data = await response.json();
  const text = data.content[0].text;

  return parseAIResults(text, city, sector);
}

function parseAIResults(text: string, city: string, sector: string): Record<string, unknown>[] {
  let cleaned = text.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }

  // Find the JSON array in the text
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) return [];

  cleaned = cleaned.substring(arrayStart, arrayEnd + 1);

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: Record<string, unknown>, i: number) => ({
      business_name: item.business_name || item.name || `Attività ${i + 1}`,
      address: item.address || '',
      city: city || '',
      sector: sector || '',
      google_place_id: null,
      google_rating: typeof item.google_rating === 'number' ? item.google_rating : null,
      google_reviews_count: typeof item.google_reviews_count === 'number' ? item.google_reviews_count : null,
      google_maps_url: item.google_maps_url || null,
      website: item.website || null,
      phone: item.phone || null,
      instagram_url: item.instagram_url || null,
      facebook_url: item.facebook_url || null,
      notes: item.notes || null,
    }));
  } catch {
    return [];
  }
}
