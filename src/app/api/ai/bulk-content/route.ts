export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';

const BULK_CONTENT_RATE_LIMIT = {
  maxRequests: 10,
  windowSeconds: 3600,
};

interface BriefInput {
  title: string;
  objective: string;
  target_audience: string;
  tone_of_voice: string;
  sector: string;
  client_name: string;
}

interface BulkContentResult {
  instagram_posts: Array<{
    style: string;
    caption: string;
  }>;
  hashtags: string[];
  story_ideas: Array<{
    title: string;
    description: string;
  }>;
  reel_concepts: Array<{
    title: string;
    hook: string;
    script_outline: string;
  }>;
  facebook_post: {
    title: string;
    content: string;
  };
}

async function callClaude(prompt: string, systemPrompt: string): Promise<{ text: string; model: string; tokens: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error('Claude API error');
  const data = await response.json();
  return {
    text: data.content[0].text,
    model: 'claude-sonnet-4-20250514',
    tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
  };
}

async function callGemini(prompt: string, systemPrompt: string): Promise<{ text: string; model: string; tokens: number }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8000 },
      }),
    }
  );

  if (!response.ok) throw new Error('Gemini API error');
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);
  return { text, model: 'gemini-2.5-flash', tokens };
}

function buildPrompt(input: BriefInput): { system: string; user: string } {
  const system = `Sei un social media manager esperto e copywriter creativo italiano. Il tuo compito è generare un pacchetto completo di contenuti social media in italiano. Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza markdown, senza backtick, senza testo aggiuntivo prima o dopo il JSON.`;

  const user = `Genera un pacchetto completo di contenuti social media in italiano basandoti su queste informazioni:

TITOLO/TEMA: ${input.title}
OBIETTIVO: ${input.objective}
TARGET AUDIENCE: ${input.target_audience}
TONE OF VOICE: ${input.tone_of_voice}
SETTORE: ${input.sector}
CLIENTE: ${input.client_name}

Genera il seguente contenuto e restituiscilo come JSON con questa struttura esatta:

{
  "instagram_posts": [
    { "style": "informativo", "caption": "..." },
    { "style": "emozionale", "caption": "..." },
    { "style": "call-to-action", "caption": "..." },
    { "style": "storytelling", "caption": "..." },
    { "style": "behind-the-scenes", "caption": "..." }
  ],
  "hashtags": ["hashtag1", "hashtag2", "..."],
  "story_ideas": [
    { "title": "...", "description": "..." },
    { "title": "...", "description": "..." },
    { "title": "...", "description": "..." }
  ],
  "reel_concepts": [
    { "title": "...", "hook": "...", "script_outline": "..." },
    { "title": "...", "hook": "...", "script_outline": "..." }
  ],
  "facebook_post": {
    "title": "...",
    "content": "..."
  }
}

REGOLE:
- Tutti i contenuti DEVONO essere in italiano
- Le caption Instagram devono essere coinvolgenti e adatte al target
- Genera tra 15 e 20 hashtag pertinenti (senza il simbolo #)
- Le story ideas devono essere creative e interattive
- I reel concepts devono avere un hook accattivante nei primi 3 secondi e uno script outline dettagliato
- Il post Facebook deve essere in formato lungo, approfondito e professionale
- Adatta il tono al tone of voice indicato
- Rispondi SOLO con il JSON, nient'altro`;

  return { system, user };
}

function parseAiResponse(text: string): BulkContentResult {
  // Try to extract JSON from the response
  let jsonStr = text.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object boundaries
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(jsonStr);

  // Validate structure with defaults
  return {
    instagram_posts: Array.isArray(parsed.instagram_posts) ? parsed.instagram_posts.slice(0, 5) : [],
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 20) : [],
    story_ideas: Array.isArray(parsed.story_ideas) ? parsed.story_ideas.slice(0, 3) : [],
    reel_concepts: Array.isArray(parsed.reel_concepts) ? parsed.reel_concepts.slice(0, 2) : [],
    facebook_post: parsed.facebook_post || { title: '', content: '' },
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  // Rate limiting: max 10 bulk content requests per hour per user
  const rateLimit = checkRateLimit(`ai:bulk-content:${user.id}`, BULK_CONTENT_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Troppe richieste. Limite: 10 generazioni all\'ora. Riprova tra qualche minuto.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
    );
  }

  // ── Input validation ──
  const contentType = request.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type deve essere application/json' }, { status: 415 });
  }

  let body: { brief_id?: string; manual_input?: BriefInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non è JSON valido' }, { status: 400 });
  }

  const MAX_FIELD_LENGTH = 1000;

  // Sanitize brief_id
  const brief_id = typeof body.brief_id === 'string' ? body.brief_id.trim() : undefined;

  // Sanitize manual_input fields
  let manual_input: BriefInput | undefined;
  if (body.manual_input && typeof body.manual_input === 'object') {
    const mi = body.manual_input;
    manual_input = {
      title: typeof mi.title === 'string' ? mi.title.trim().slice(0, MAX_FIELD_LENGTH) : '',
      objective: typeof mi.objective === 'string' ? mi.objective.trim().slice(0, MAX_FIELD_LENGTH) : '',
      target_audience: typeof mi.target_audience === 'string' ? mi.target_audience.trim().slice(0, MAX_FIELD_LENGTH) : '',
      tone_of_voice: typeof mi.tone_of_voice === 'string' ? mi.tone_of_voice.trim().slice(0, MAX_FIELD_LENGTH) : '',
      sector: typeof mi.sector === 'string' ? mi.sector.trim().slice(0, MAX_FIELD_LENGTH) : '',
      client_name: typeof mi.client_name === 'string' ? mi.client_name.trim().slice(0, 200) : '',
    };
  }

  if (!brief_id && !manual_input) {
    return NextResponse.json({ error: 'Specifica un brief_id o manual_input' }, { status: 400 });
  }

  let briefInput: BriefInput;

  if (brief_id) {
    // Load brief from creative_briefs table
    const { data: brief, error } = await supabase
      .from('creative_briefs')
      .select('*, client:clients(id, name, company)')
      .eq('id', brief_id)
      .single();

    if (error || !brief) {
      return NextResponse.json({ error: 'Brief non trovato' }, { status: 404 });
    }

    const clientName = brief.client?.company || brief.client?.name || 'N/A';

    briefInput = {
      title: brief.title || '',
      objective: brief.objective || '',
      target_audience: brief.target_audience || '',
      tone_of_voice: brief.tone_of_voice || '',
      sector: brief.deliverables || '',
      client_name: clientName,
    };
  } else {
    briefInput = manual_input!;
    // Validate required fields
    if (!briefInput.title || !briefInput.objective) {
      return NextResponse.json({ error: 'Titolo e obiettivo sono richiesti' }, { status: 400 });
    }
  }

  const { system, user: userPrompt } = buildPrompt(briefInput);

  let result: { text: string; model: string; tokens: number };
  let provider: string;

  // Try Claude first, fallback to Gemini
  try {
    result = await callClaude(userPrompt, system);
    provider = 'claude';
  } catch {
    try {
      result = await callGemini(userPrompt, system);
      provider = 'gemini';
    } catch {
      return NextResponse.json(
        { error: 'Errore nella generazione. Verifica le API key configurate.' },
        { status: 500 }
      );
    }
  }

  // Parse AI response into structured content
  let content: BulkContentResult;
  try {
    content = parseAiResponse(result.text);
  } catch {
    return NextResponse.json(
      { error: 'Errore nel parsing della risposta AI. Riprova.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    content,
    provider,
    model: result.model,
    tokens: result.tokens,
    brief_input: briefInput,
  });
}
