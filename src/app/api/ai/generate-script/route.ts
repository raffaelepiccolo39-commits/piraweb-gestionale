import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error('Claude API error');
  const data = await response.json();
  return {
    text: data.content[0].text,
    model: 'claude-sonnet-4-20250514',
    tokens: data.usage?.input_tokens + data.usage?.output_tokens || 0,
  };
}

async function callGemini(prompt: string, systemPrompt: string): Promise<{ text: string; model: string; tokens: number }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4000 },
      }),
    }
  );

  if (!response.ok) throw new Error('Gemini API error');
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);
  return { text, model: 'gemini-2.0-flash', tokens };
}

async function callOpenAI(prompt: string, systemPrompt: string): Promise<{ text: string; model: string; tokens: number }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4000,
    }),
  });

  if (!response.ok) throw new Error('OpenAI API error');
  const data = await response.json();
  return {
    text: data.choices[0].message.content,
    model: 'gpt-4o',
    tokens: data.usage?.total_tokens || 0,
  };
}

const scriptTypePrompts: Record<string, string> = {
  social_post: 'Sei un esperto social media manager. Crea contenuti coinvolgenti per i social media con hashtag appropriati, emoji e call-to-action. Adatta il tono al brand.',
  blog_article: 'Sei un esperto content writer. Scrivi articoli blog SEO-friendly, ben strutturati con titoli H2/H3, paragrafi concisi e un tono professionale ma accessibile.',
  email_campaign: 'Sei un esperto di email marketing. Crea email persuasive con subject line accattivanti, copy coinvolgente e CTA chiare. Segui le best practice di email marketing.',
  ad_copy: 'Sei un copywriter pubblicitario esperto. Crea testi pubblicitari persuasivi, concisi e orientati alla conversione. Usa tecniche di persuasione e AIDA framework.',
  video_script: 'Sei un esperto di video content. Scrivi script video con hook iniziale, struttura narrativa coinvolgente e call-to-action finale. Includi indicazioni per visual e timing.',
  brand_guidelines: 'Sei un brand strategist esperto. Crea linee guida di brand complete con tone of voice, valori, personalità del brand e regole di comunicazione.',
  other: 'Sei un esperto di comunicazione e marketing digitale. Crea contenuti professionali e strategici.',
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { title, prompt, script_type, client_id, project_id, preferred_provider } = await request.json();

  if (!prompt || !script_type) {
    return NextResponse.json({ error: 'Prompt e tipo script sono richiesti' }, { status: 400 });
  }

  // Get full client context including knowledge base
  let clientContext = '';
  if (client_id) {
    const [clientRes, kbRes] = await Promise.all([
      supabase.from('clients').select('name, company, website, notes').eq('id', client_id).single(),
      supabase.from('client_knowledge_base').select('*').eq('client_id', client_id).maybeSingle(),
    ]);
    const client = clientRes.data;
    const kb = kbRes.data;

    if (client) {
      clientContext = `\n\n=== CONTESTO CLIENTE ===\nNome: ${client.name}\nAzienda: ${client.company || 'N/A'}\nSito: ${client.website || 'N/A'}`;
      if (client.notes) clientContext += `\nNote: ${client.notes}`;
    }
    if (kb) {
      if (kb.strategy) clientContext += `\n\nSTRATEGIA: ${kb.strategy}`;
      if (kb.objectives) clientContext += `\nOBIETTIVI: ${kb.objectives}`;
      if (kb.target_audience) clientContext += `\nTARGET: ${kb.target_audience}`;
      if (kb.tone_of_voice) clientContext += `\nTONE OF VOICE: ${kb.tone_of_voice}`;
      if (kb.brand_guidelines) clientContext += `\nBRAND GUIDELINES: ${kb.brand_guidelines}`;
      if (kb.services) clientContext += `\nSERVIZI: ${kb.services}`;
      if (kb.competitors) clientContext += `\nCOMPETITOR: ${kb.competitors}`;
      if (kb.keywords) clientContext += `\nKEYWORDS: ${kb.keywords}`;
      if (kb.additional_notes) clientContext += `\nNOTE: ${kb.additional_notes}`;
    }
  }

  const systemPrompt = scriptTypePrompts[script_type] || scriptTypePrompts.other;
  const fullPrompt = `${prompt}${clientContext}`;

  let result: { text: string; model: string; tokens: number };
  let provider: 'claude' | 'openai' | 'gemini';

  const callMap = {
    claude: callClaude,
    openai: callOpenAI,
    gemini: callGemini,
  };
  const fallbackOrder = ['claude', 'gemini', 'openai'] as const;

  const primary = (preferred_provider || 'claude') as keyof typeof callMap;
  const fallbacks = fallbackOrder.filter((p) => p !== primary);

  try {
    result = await callMap[primary](fullPrompt, systemPrompt);
    provider = primary;
  } catch {
    let succeeded = false;
    for (const fb of fallbacks) {
      try {
        result = await callMap[fb](fullPrompt, systemPrompt);
        provider = fb;
        succeeded = true;
        break;
      } catch {
        continue;
      }
    }
    if (!succeeded) {
      return NextResponse.json(
        { error: 'Errore nella generazione. Verifica le API key.' },
        { status: 500 }
      );
    }
  }

  // Save to database
  const { data: script, error } = await supabase
    .from('ai_scripts')
    .insert({
      title: title || `Script ${script_type}`,
      prompt,
      result: result.text,
      script_type,
      provider,
      model: result.model,
      client_id: client_id || null,
      project_id: project_id || null,
      tokens_used: result.tokens,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Errore nel salvataggio' }, { status: 500 });
  }

  return NextResponse.json({ script, provider });
}
