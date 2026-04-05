'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { formatDateTime, getRoleLabel } from '@/lib/utils';
import type { AiScript, Client, Project } from '@/types/database';
import {
  Sparkles,
  Wand2,
  Send,
  Star,
  Copy,
  Check,
  Loader2,
  Brain,
  ListTodo,
} from 'lucide-react';

const scriptTypeOptions = [
  { value: 'social_post', label: 'Post Social' },
  { value: 'blog_article', label: 'Articolo Blog' },
  { value: 'email_campaign', label: 'Email Campaign' },
  { value: 'ad_copy', label: 'Ad Copy' },
  { value: 'video_script', label: 'Script Video' },
  { value: 'brand_guidelines', label: 'Brand Guidelines' },
  { value: 'other', label: 'Altro' },
];

const providerOptions = [
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'openai', label: 'GPT-4o (OpenAI)' },
];

export default function AiPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'generate' | 'assign' | 'history'>('generate');
  const [scripts, setScripts] = useState<AiScript[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Script generation form
  const [scriptForm, setScriptForm] = useState({
    title: '',
    prompt: '',
    script_type: 'social_post',
    client_id: '',
    project_id: '',
    preferred_provider: 'claude',
  });
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [generatedProvider, setGeneratedProvider] = useState<string | null>(null);

  // Task assignment form
  const [taskInput, setTaskInput] = useState('');
  const [taskProjectId, setTaskProjectId] = useState('');
  const [parsedTasks, setParsedTasks] = useState<Array<{
    title: string;
    description: string;
    assigned_to_role: string;
    assigned_to: string | null;
    priority: string;
    estimated_hours: number | null;
  }> | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [tasksSaved, setTasksSaved] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchData = useCallback(async () => {
    const [scriptsRes, clientsRes, projectsRes] = await Promise.all([
      supabase
        .from('ai_scripts')
        .select('*, client:clients(id, name)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
      supabase.from('projects').select('*').in('status', ['draft', 'active']).order('name'),
    ]);
    if (scriptsRes.data) setScripts(scriptsRes.data as AiScript[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (projectsRes.data) setProjects(projectsRes.data as Project[]);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerateScript = async () => {
    if (!scriptForm.prompt) return;
    setLoading(true);
    setGeneratedResult(null);

    try {
      const res = await fetch('/api/ai/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scriptForm),
      });

      const data = await res.json();
      if (res.ok) {
        setGeneratedResult(data.script.result);
        setGeneratedProvider(data.provider);
        fetchData();
      } else {
        setGeneratedResult(`Errore: ${data.error}`);
      }
    } catch {
      setGeneratedResult('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleParseTasks = async () => {
    if (!taskInput || !taskProjectId) return;
    setTaskLoading(true);
    setParsedTasks(null);
    setTasksSaved(false);

    try {
      const res = await fetch('/api/ai/parse-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: taskInput, project_id: taskProjectId }),
      });

      const data = await res.json();
      if (res.ok) {
        setParsedTasks(data.tasks);
      }
    } catch {
      // error handled
    } finally {
      setTaskLoading(false);
    }
  };

  const handleSaveTasks = async () => {
    if (!parsedTasks || !profile) return;
    setTaskLoading(true);

    const tasksToInsert = parsedTasks.map((task, index) => ({
      title: task.title,
      description: task.description,
      project_id: taskProjectId,
      assigned_to: task.assigned_to,
      priority: task.priority,
      status: 'todo' as const,
      position: index,
      estimated_hours: task.estimated_hours,
      ai_generated: true,
      created_by: profile.id,
    }));

    const { error } = await supabase.from('tasks').insert(tasksToInsert);
    if (!error) {
      setTasksSaved(true);
    }
    setTaskLoading(false);
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleFavorite = async (script: AiScript) => {
    await supabase
      .from('ai_scripts')
      .update({ is_favorite: !script.is_favorite })
      .eq('id', script.id);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
          AI Assistant
        </h1>
        <p className="text-sm text-pw-text-muted">
          Genera contenuti e assegna task con l'intelligenza artificiale
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-pw-surface-3 p-1 rounded-xl overflow-x-auto no-scrollbar w-fit">
        {[
          { id: 'generate' as const, label: 'Genera Script', icon: Wand2 },
          ...(isAdmin ? [{ id: 'assign' as const, label: 'Assegna Task', icon: ListTodo }] : []),
          { id: 'history' as const, label: 'Cronologia', icon: Sparkles },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-pw-surface text-pw-text shadow-sm'
                : 'text-pw-text-muted hover:text-pw-text'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Generate Script Tab */}
      {activeTab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text">
                Genera Contenuto
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                id="script-title"
                label="Titolo"
                value={scriptForm.title}
                onChange={(e) => setScriptForm({ ...scriptForm, title: e.target.value })}
                placeholder="es. Post lancio prodotto"
              />
              <Select
                id="script-type"
                label="Tipo di contenuto"
                value={scriptForm.script_type}
                onChange={(e) => setScriptForm({ ...scriptForm, script_type: e.target.value })}
                options={scriptTypeOptions}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  id="script-client"
                  label="Cliente"
                  value={scriptForm.client_id}
                  onChange={(e) => setScriptForm({ ...scriptForm, client_id: e.target.value })}
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Opzionale"
                />
                <Select
                  id="script-provider"
                  label="Provider AI"
                  value={scriptForm.preferred_provider}
                  onChange={(e) => setScriptForm({ ...scriptForm, preferred_provider: e.target.value })}
                  options={providerOptions}
                />
              </div>
              <Textarea
                id="script-prompt"
                label="Prompt *"
                value={scriptForm.prompt}
                onChange={(e) => setScriptForm({ ...scriptForm, prompt: e.target.value })}
                placeholder="Descrivi cosa vuoi generare... es. 'Crea 3 post Instagram per il lancio di una nuova collezione estiva di moda sostenibile'"
                rows={5}
              />
              <Button
                onClick={handleGenerateScript}
                loading={loading}
                disabled={!scriptForm.prompt}
                className="w-full"
              >
                <Sparkles size={18} />
                Genera
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-pw-text">
                  Risultato
                </h2>
                {generatedProvider && (
                  <Badge className="bg-indigo-500/15 text-indigo-400">
                    {generatedProvider === 'claude' ? 'Claude' : generatedProvider === 'gemini' ? 'Gemini' : 'GPT-4o'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Brain size={40} className="text-indigo-500 animate-pulse mb-3" />
                  <p className="text-sm text-gray-500">Generazione in corso...</p>
                </div>
              ) : generatedResult ? (
                <div>
                  <div className="relative">
                    <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap bg-pw-surface-2 rounded-xl p-4 max-h-96 overflow-y-auto">
                      {generatedResult}
                    </div>
                    <button
                      onClick={() => copyToClipboard(generatedResult, 'result')}
                      className="absolute top-2 right-2 p-2 rounded-lg bg-pw-surface-3 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      {copied === 'result' ? (
                        <Check size={16} className="text-green-500" />
                      ) : (
                        <Copy size={16} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Wand2}
                  title="Nessun risultato"
                  description="Compila il form e clicca Genera per creare contenuto AI"
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assign Tasks Tab */}
      {activeTab === 'assign' && isAdmin && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text">
                Assegnazione Task Intelligente
              </h2>
              <p className="text-sm text-pw-text-muted mt-1">
                Descrivi in linguaggio naturale cosa va fatto e l'AI creerà e assegnerà i task al team
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                id="task-project"
                label="Progetto *"
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Seleziona progetto"
              />
              <Textarea
                id="task-input"
                label="Descrivi i task"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder={`es. "Per il lancio del nuovo sito di Bianchi Fashion dobbiamo: creare 5 post Instagram con le foto della collezione, scrivere un articolo blog sulla moda sostenibile, preparare il logo per le stories e una newsletter per i clienti VIP. Il tutto entro venerdì, priorità alta."`}
                rows={5}
              />
              <Button
                onClick={handleParseTasks}
                loading={taskLoading}
                disabled={!taskInput || !taskProjectId}
              >
                <Brain size={18} />
                Analizza e Crea Task
              </Button>
            </CardContent>
          </Card>

          {parsedTasks && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-pw-text">
                    Task Generati ({parsedTasks.length})
                  </h2>
                  {!tasksSaved ? (
                    <Button onClick={handleSaveTasks} loading={taskLoading}>
                      <Check size={16} />
                      Salva tutti i task
                    </Button>
                  ) : (
                    <Badge className="bg-green-500/15 text-green-400">
                      Salvati!
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {parsedTasks.map((task, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl border border-pw-border bg-pw-surface-2/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-pw-text">
                            {task.title}
                          </h4>
                          <p className="text-sm text-pw-text-muted mt-1">
                            {task.description}
                          </p>
                        </div>
                        <Badge className="bg-indigo-500/15 text-indigo-400 shrink-0">
                          {getRoleLabel(task.assigned_to_role)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>Priorità: {task.priority}</span>
                        {task.estimated_hours && <span>~{task.estimated_hours}h</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          {scripts.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nessun script generato"
              description="Genera il tuo primo contenuto AI"
            />
          ) : (
            <div className="space-y-3">
              {scripts.map((script) => (
                <Card key={script.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-pw-text truncate">
                            {script.title}
                          </h3>
                          <Badge className="bg-pw-surface-3 text-pw-text-muted shrink-0">
                            {scriptTypeOptions.find((o) => o.value === script.script_type)?.label}
                          </Badge>
                          {script.provider && (
                            <Badge className="bg-indigo-500/15 text-indigo-400 shrink-0">
                              {script.provider === 'claude' ? 'Claude' : script.provider === 'gemini' ? 'Gemini' : 'GPT-4o'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-pw-text-muted line-clamp-2">
                          {script.prompt}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDateTime(script.created_at)}
                          {script.tokens_used && ` · ${script.tokens_used} tokens`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleFavorite(script)}
                          className="p-1.5 rounded-lg hover:bg-pw-surface-2"
                        >
                          <Star
                            size={16}
                            className={
                              script.is_favorite
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-gray-400'
                            }
                          />
                        </button>
                        {script.result && (
                          <button
                            onClick={() => copyToClipboard(script.result!, script.id)}
                            className="p-1.5 rounded-lg hover:bg-pw-surface-2"
                          >
                            {copied === script.id ? (
                              <Check size={16} className="text-green-500" />
                            ) : (
                              <Copy size={16} className="text-gray-400" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
