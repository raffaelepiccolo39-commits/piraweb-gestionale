'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { CreativeBrief } from '@/types/database';
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  Brain,
  AtSign,
  Hash,
  Film,
  Globe,
  Layers,
  Save,
  ClipboardCopy,
  FileText,
  PenTool,
} from 'lucide-react';

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

interface GenerationResponse {
  content: BulkContentResult;
  provider: string;
  model: string;
  tokens: number;
  brief_input: {
    title: string;
    objective: string;
    target_audience: string;
    tone_of_voice: string;
    sector: string;
    client_name: string;
  };
}

const STYLE_LABELS: Record<string, string> = {
  informativo: 'Informativo',
  emozionale: 'Emozionale',
  'call-to-action': 'Call to Action',
  storytelling: 'Storytelling',
  'behind-the-scenes': 'Behind the Scenes',
};

const STYLE_COLORS: Record<string, string> = {
  informativo: 'bg-blue-500/15 text-blue-400',
  emozionale: 'bg-pink-500/15 text-pink-400',
  'call-to-action': 'bg-orange-500/15 text-orange-400',
  storytelling: 'bg-purple-500/15 text-purple-400',
  'behind-the-scenes': 'bg-teal-500/15 text-teal-400',
};

type InputMode = 'brief' | 'manual';

export default function AiContentPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [briefs, setBriefs] = useState<CreativeBrief[]>([]);
  const [selectedBriefId, setSelectedBriefId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResponse | null>(null);

  const [manualForm, setManualForm] = useState({
    title: '',
    objective: '',
    target_audience: '',
    tone_of_voice: '',
    sector: '',
    client_name: '',
  });

  const fetchBriefs = useCallback(async () => {
    const { data } = await supabase
      .from('creative_briefs')
      .select('*, client:clients(id, name, company)')
      .order('created_at', { ascending: false });
    if (data) setBriefs(data as CreativeBrief[]);
  }, [supabase]);

  useEffect(() => {
    fetchBriefs();
  }, [fetchBriefs]);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);

    const body: Record<string, unknown> = {};
    if (inputMode === 'brief') {
      if (!selectedBriefId) {
        toast.error('Seleziona un brief');
        setLoading(false);
        return;
      }
      body.brief_id = selectedBriefId;
    } else {
      if (!manualForm.title || !manualForm.objective) {
        toast.error('Titolo e obiettivo sono obbligatori');
        setLoading(false);
        return;
      }
      body.manual_input = manualForm;
    }

    try {
      const res = await fetch('/api/ai/bulk-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data as GenerationResponse);
        toast.success('Contenuti generati con successo!');
      } else if (res.status === 429) {
        toast.error('Hai raggiunto il limite di richieste. Riprova tra qualche minuto.');
      } else {
        toast.error(data.error || 'Errore nella generazione');
      }
    } catch {
      toast.error('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = async () => {
    if (!result) return;
    const { content } = result;
    const parts: string[] = [];

    parts.push('=== POST INSTAGRAM ===');
    content.instagram_posts.forEach((p, i) => {
      parts.push(`\n--- ${STYLE_LABELS[p.style] || p.style} ---`);
      parts.push(p.caption);
    });

    parts.push('\n\n=== HASHTAG ===');
    parts.push(content.hashtags.map((h) => `#${h}`).join(' '));

    parts.push('\n\n=== STORY IDEAS ===');
    content.story_ideas.forEach((s, i) => {
      parts.push(`\n${i + 1}. ${s.title}`);
      parts.push(s.description);
    });

    parts.push('\n\n=== REEL CONCEPTS ===');
    content.reel_concepts.forEach((r, i) => {
      parts.push(`\n${i + 1}. ${r.title}`);
      parts.push(`Hook: ${r.hook}`);
      parts.push(`Script: ${r.script_outline}`);
    });

    parts.push('\n\n=== POST FACEBOOK ===');
    parts.push(content.facebook_post.title);
    parts.push(content.facebook_post.content);

    await copyToClipboard(parts.join('\n'), 'all');
    toast.success('Tutti i contenuti copiati!');
  };

  const handleSaveToPlan = async () => {
    if (!result || !profile) return;
    setSaving(true);

    try {
      const clientName = result.brief_input.client_name;
      // Find or skip client matching
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .or(`name.ilike.%${clientName}%,company.ilike.%${clientName}%`)
        .limit(1);
      const clientId = clients?.[0]?.id || null;

      if (!clientId) {
        toast.error('Cliente non trovato. Crea prima il cliente nel CRM.');
        setSaving(false);
        return;
      }

      const { content } = result;
      const posts: Array<Record<string, unknown>> = [];

      // Instagram posts
      content.instagram_posts.forEach((p) => {
        posts.push({
          title: `IG - ${STYLE_LABELS[p.style] || p.style}: ${result.brief_input.title}`,
          caption: p.caption,
          platforms: ['instagram'],
          status: 'draft',
          hashtags: content.hashtags.map((h) => `#${h}`).join(' '),
          client_id: clientId,
          created_by: profile.id,
        });
      });

      // Facebook post
      posts.push({
        title: `FB: ${content.facebook_post.title}`,
        caption: content.facebook_post.content,
        platforms: ['facebook'],
        status: 'draft',
        client_id: clientId,
        created_by: profile.id,
      });

      const { error } = await supabase.from('social_posts').insert(posts);
      if (error) {
        toast.error('Errore nel salvataggio');
      } else {
        toast.success(`${posts.length} post salvati nel piano editoriale!`);
      }
    } catch {
      toast.error('Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copyToClipboard(text, id)}
      className="p-1.5 rounded-lg hover:bg-pw-surface-3 transition-colors duration-200 ease-out shrink-0"
      title="Copia"
    >
      {copied === id ? (
        <Check size={14} className="text-green-500" />
      ) : (
        <Copy size={14} className="text-pw-text-dim" />
      )}
    </button>
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
          AI Content Generator
        </h1>
        <p className="text-sm text-pw-text-muted">
          Genera un pacchetto completo di contenuti social da un brief o da input manuale
        </p>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-pw-text">
              Sorgente Contenuti
            </h2>
            <div className="flex gap-1 bg-pw-surface-3 p-1 rounded-xl">
              <button
                onClick={() => setInputMode('brief')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ease-out ${
                  inputMode === 'brief'
                    ? 'bg-pw-surface text-pw-text shadow-sm'
                    : 'text-pw-text-muted hover:text-pw-text'
                }`}
              >
                <FileText size={14} />
                Da Brief
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ease-out ${
                  inputMode === 'manual'
                    ? 'bg-pw-surface text-pw-text shadow-sm'
                    : 'text-pw-text-muted hover:text-pw-text'
                }`}
              >
                <PenTool size={14} />
                Input Manuale
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {inputMode === 'brief' ? (
            <Select
              id="brief-select"
              label="Seleziona Brief"
              value={selectedBriefId}
              onChange={(e) => setSelectedBriefId(e.target.value)}
              options={briefs.map((b) => ({
                value: b.id,
                label: `${b.title}${b.client ? ` - ${b.client.company || b.client.name}` : ''}`,
              }))}
              placeholder="Scegli un brief esistente..."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="manual-title"
                label="Titolo / Tema *"
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                placeholder="es. Lancio collezione estiva"
              />
              <Input
                id="manual-client"
                label="Nome Cliente"
                value={manualForm.client_name}
                onChange={(e) => setManualForm({ ...manualForm, client_name: e.target.value })}
                placeholder="es. Fashion Brand XYZ"
              />
              <Input
                id="manual-sector"
                label="Settore"
                value={manualForm.sector}
                onChange={(e) => setManualForm({ ...manualForm, sector: e.target.value })}
                placeholder="es. Moda, Food, Tech..."
              />
              <Select
                id="manual-tone"
                label="Tone of Voice"
                value={manualForm.tone_of_voice}
                onChange={(e) => setManualForm({ ...manualForm, tone_of_voice: e.target.value })}
                options={[
                  { value: 'professionale', label: 'Professionale' },
                  { value: 'amichevole', label: 'Amichevole' },
                  { value: 'ironico', label: 'Ironico' },
                  { value: 'lusso', label: 'Lusso / Esclusivo' },
                  { value: 'giovane', label: 'Giovane / Dinamico' },
                  { value: 'istituzionale', label: 'Istituzionale' },
                  { value: 'empatico', label: 'Empatico' },
                ]}
                placeholder="Seleziona..."
              />
              <Textarea
                id="manual-objective"
                label="Obiettivo *"
                value={manualForm.objective}
                onChange={(e) => setManualForm({ ...manualForm, objective: e.target.value })}
                placeholder="es. Aumentare awareness sul lancio della nuova collezione e generare traffico allo shop online"
                rows={3}
              />
              <Textarea
                id="manual-target"
                label="Target Audience"
                value={manualForm.target_audience}
                onChange={(e) => setManualForm({ ...manualForm, target_audience: e.target.value })}
                placeholder="es. Donne 25-40 anni, interessate a moda sostenibile, reddito medio-alto"
                rows={3}
              />
            </div>
          )}

          <Button
            onClick={handleGenerate}
            loading={loading}
            disabled={loading}
            className="w-full"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? 'Generazione in corso...' : 'Genera Contenuti'}
          </Button>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center">
              <Brain size={48} className="text-indigo-500 animate-pulse mb-4" />
              <p className="text-pw-text font-medium">Generazione in corso...</p>
              <p className="text-sm text-pw-text-muted mt-1">
                L&apos;AI sta creando 5 post Instagram, hashtag, story ideas, reel e un post Facebook
              </p>
              <Loader2 size={20} className="text-pw-text-muted animate-spin mt-4" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-indigo-500/15 text-indigo-400">
                {result.provider === 'claude' ? 'Claude' : 'Gemini'}
              </Badge>
              <span className="text-xs text-pw-text-muted">
                {result.tokens} tokens
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={copyAll} className="text-sm">
                <ClipboardCopy size={16} />
                Copia Tutto
              </Button>
              <Button onClick={handleSaveToPlan} loading={saving} className="text-sm">
                <Save size={16} />
                Salva nel Piano Editoriale
              </Button>
            </div>
          </div>

          {/* Instagram Posts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AtSign size={20} className="text-pink-500" />
              <h3 className="text-lg font-semibold text-pw-text">
                Post Instagram ({result.content.instagram_posts.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {result.content.instagram_posts.map((post, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className={STYLE_COLORS[post.style] || 'bg-pw-surface-2 text-pw-text-dim'}>
                        {STYLE_LABELS[post.style] || post.style}
                      </Badge>
                      <CopyButton text={post.caption} id={`ig-${i}`} />
                    </div>
                    <p className="text-sm text-pw-text whitespace-pre-wrap leading-relaxed">
                      {post.caption}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Hashtags */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Hash size={20} className="text-blue-500" />
              <h3 className="text-lg font-semibold text-pw-text">
                Hashtag Set ({result.content.hashtags.length})
              </h3>
            </div>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {result.content.hashtags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-block px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-sm font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <CopyButton
                    text={result.content.hashtags.map((h) => `#${h}`).join(' ')}
                    id="hashtags"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Story Ideas */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Layers size={20} className="text-purple-500" />
              <h3 className="text-lg font-semibold text-pw-text">
                Story Ideas ({result.content.story_ideas.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.content.story_ideas.map((story, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-pw-text text-sm">
                        {story.title}
                      </h4>
                      <CopyButton
                        text={`${story.title}\n${story.description}`}
                        id={`story-${i}`}
                      />
                    </div>
                    <p className="text-sm text-pw-text-muted leading-relaxed">
                      {story.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Reel Concepts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Film size={20} className="text-orange-500" />
              <h3 className="text-lg font-semibold text-pw-text">
                Reel Concepts ({result.content.reel_concepts.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.content.reel_concepts.map((reel, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="font-medium text-pw-text">
                        {reel.title}
                      </h4>
                      <CopyButton
                        text={`${reel.title}\nHook: ${reel.hook}\nScript: ${reel.script_outline}`}
                        id={`reel-${i}`}
                      />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs uppercase tracking-wider font-medium text-orange-400">
                          Hook
                        </span>
                        <p className="text-sm text-pw-text mt-1">
                          {reel.hook}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wider font-medium text-pw-text-muted">
                          Script Outline
                        </span>
                        <p className="text-sm text-pw-text-muted mt-1 whitespace-pre-wrap leading-relaxed">
                          {reel.script_outline}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Facebook Post */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={20} className="text-blue-600" />
              <h3 className="text-lg font-semibold text-pw-text">
                Post Facebook
              </h3>
            </div>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-pw-text mb-2">
                      {result.content.facebook_post.title}
                    </h4>
                    <p className="text-sm text-pw-text whitespace-pre-wrap leading-relaxed">
                      {result.content.facebook_post.content}
                    </p>
                  </div>
                  <CopyButton
                    text={`${result.content.facebook_post.title}\n\n${result.content.facebook_post.content}`}
                    id="facebook"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Empty state when no results and not loading */}
      {!result && !loading && (
        <EmptyState
          icon={Sparkles}
          title="Nessun contenuto generato"
          description="Seleziona un brief o compila il form manuale, poi clicca 'Genera Contenuti' per creare un pacchetto completo di contenuti social"
        />
      )}
    </div>
  );
}
