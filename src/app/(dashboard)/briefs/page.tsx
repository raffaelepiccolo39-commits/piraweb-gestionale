'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import type { CreativeBrief, Project, Client } from '@/types/database';
import {
  FileEdit,
  Plus,
  Target,
  Users,
  MessageSquare,
  CheckCircle,
  Calendar,
  ExternalLink,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza',
  approved: 'Approvato',
  in_progress: 'In lavorazione',
  completed: 'Completato',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

export default function BriefsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [briefs, setBriefs] = useState<CreativeBrief[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedBrief, setSelectedBrief] = useState<CreativeBrief | null>(null);

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    title: '',
    project_id: '',
    client_id: '',
    objective: '',
    target_audience: '',
    key_message: '',
    tone_of_voice: '',
    deliverables: '',
    do_list: '',
    dont_list: '',
    references_urls: '',
    deadline: '',
    budget_notes: '',
  });

  const fetchBriefs = useCallback(async () => {
    const { data } = await supabase
      .from('creative_briefs')
      .select('*, project:projects(id, name), client:clients(id, name, company), creator:profiles!creative_briefs_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false });
    setBriefs((data as CreativeBrief[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([
      fetchBriefs(),
      supabase.from('projects').select('id, name, client_id').eq('status', 'active').order('name').then((r) => setProjects((r.data as Project[]) || [])),
      supabase.from('clients').select('id, name, company').eq('is_active', true).order('company').then((r) => setClients((r.data as Client[]) || [])),
    ]).finally(() => setLoading(false));
  }, [fetchBriefs, supabase]);

  const handleCreate = async () => {
    if (!form.title || !form.project_id) {
      toast.error('Titolo e progetto sono obbligatori');
      return;
    }

    const refs = form.references_urls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    const { error } = await supabase.from('creative_briefs').insert({
      title: form.title,
      project_id: form.project_id,
      client_id: form.client_id || null,
      objective: form.objective || null,
      target_audience: form.target_audience || null,
      key_message: form.key_message || null,
      tone_of_voice: form.tone_of_voice || null,
      deliverables: form.deliverables || null,
      do_list: form.do_list || null,
      dont_list: form.dont_list || null,
      references_urls: refs,
      deadline: form.deadline || null,
      budget_notes: form.budget_notes || null,
      created_by: profile!.id,
    });

    if (error) {
      toast.error('Errore nella creazione');
    } else {
      toast.success('Brief creato');
      setShowForm(false);
      setForm({ title: '', project_id: '', client_id: '', objective: '', target_audience: '', key_message: '', tone_of_voice: '', deliverables: '', do_list: '', dont_list: '', references_urls: '', deadline: '', budget_notes: '' });
      fetchBriefs();
    }
  };

  const handleApprove = async (briefId: string) => {
    await supabase.from('creative_briefs').update({
      status: 'approved',
      approved_by: profile!.id,
      approved_at: new Date().toISOString(),
    }).eq('id', briefId);
    toast.success('Brief approvato');
    fetchBriefs();
    if (selectedBrief?.id === briefId) {
      setSelectedBrief((b) => b ? { ...b, status: 'approved' } : null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text flex items-center gap-2">
            <FileEdit size={24} className="text-pw-accent" />
            Brief Creativi
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Crea brief strutturati per guidare il lavoro creativo del team</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={16} />
          Nuovo Brief
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brief list */}
        <div className="space-y-3">
          {briefs.map((brief) => {
            const project = brief.project as Project | undefined;
            const client = brief.client as Client | undefined;
            return (
              <button
                key={brief.id}
                onClick={() => setSelectedBrief(brief)}
                className={`w-full text-left p-4 rounded-xl transition-colors border ${
                  selectedBrief?.id === brief.id
                    ? 'bg-pw-accent/10 border-pw-accent/30'
                    : 'bg-pw-surface-2 border-transparent hover:bg-pw-surface-3'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-sm font-medium text-pw-text line-clamp-1">{brief.title}</h3>
                  <Badge className={STATUS_COLORS[brief.status]}>{STATUS_LABELS[brief.status]}</Badge>
                </div>
                <p className="text-[10px] text-pw-text-dim">
                  {project?.name}{client ? ` · ${client.company || client.name}` : ''}
                </p>
                {brief.deadline && (
                  <p className="text-[10px] text-pw-text-dim mt-1 flex items-center gap-1">
                    <Calendar size={8} />
                    {formatDate(brief.deadline)}
                  </p>
                )}
              </button>
            );
          })}
          {briefs.length === 0 && (
            <div className="text-center py-12">
              <FileEdit size={32} className="text-pw-text-dim mx-auto mb-2" />
              <p className="text-sm text-pw-text-muted">Nessun brief ancora</p>
            </div>
          )}
        </div>

        {/* Brief detail */}
        <div className="lg:col-span-2">
          {selectedBrief ? (
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-pw-text">{selectedBrief.title}</h2>
                    <p className="text-xs text-pw-text-dim mt-1">
                      Creato {formatDate(selectedBrief.created_at)}
                      {selectedBrief.approved_at && ` · Approvato ${formatDate(selectedBrief.approved_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={STATUS_COLORS[selectedBrief.status]}>{STATUS_LABELS[selectedBrief.status]}</Badge>
                    {isAdmin && selectedBrief.status === 'draft' && (
                      <Button size="sm" onClick={() => handleApprove(selectedBrief.id)}>
                        <CheckCircle size={12} />
                        Approva
                      </Button>
                    )}
                  </div>
                </div>

                {selectedBrief.objective && (
                  <Section icon={Target} title="Obiettivo">
                    <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.objective}</p>
                  </Section>
                )}

                {selectedBrief.target_audience && (
                  <Section icon={Users} title="Target Audience">
                    <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.target_audience}</p>
                  </Section>
                )}

                {selectedBrief.key_message && (
                  <Section icon={MessageSquare} title="Messaggio Chiave">
                    <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.key_message}</p>
                  </Section>
                )}

                {selectedBrief.tone_of_voice && (
                  <Section icon={Sparkles} title="Tone of Voice">
                    <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.tone_of_voice}</p>
                  </Section>
                )}

                {selectedBrief.deliverables && (
                  <Section icon={CheckCircle} title="Deliverable">
                    <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.deliverables}</p>
                  </Section>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedBrief.do_list && (
                    <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                      <p className="text-xs font-semibold text-green-400 flex items-center gap-1 mb-2">
                        <ThumbsUp size={12} /> DA FARE
                      </p>
                      <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.do_list}</p>
                    </div>
                  )}
                  {selectedBrief.dont_list && (
                    <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                      <p className="text-xs font-semibold text-red-400 flex items-center gap-1 mb-2">
                        <ThumbsDown size={12} /> DA NON FARE
                      </p>
                      <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedBrief.dont_list}</p>
                    </div>
                  )}
                </div>

                {selectedBrief.references_urls.length > 0 && (
                  <Section icon={ExternalLink} title="Riferimenti / Mood Board">
                    <div className="space-y-1">
                      {selectedBrief.references_urls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-pw-accent hover:underline flex items-center gap-1 truncate"
                        >
                          <ExternalLink size={10} className="shrink-0" />
                          {url}
                        </a>
                      ))}
                    </div>
                  </Section>
                )}

                {selectedBrief.deadline && (
                  <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                    <Calendar size={14} />
                    Deadline: <span className="font-medium text-pw-text">{formatDate(selectedBrief.deadline)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-center">
              <div>
                <FileEdit size={48} className="text-pw-text-dim mx-auto mb-3" />
                <p className="text-pw-text-muted text-sm">Seleziona un brief per vedere i dettagli</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create brief modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuovo Brief Creativo">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input label="Titolo Brief" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Es: Campagna lancio estate 2026" required />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Progetto" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} options={projects.map((p) => ({ value: p.id, label: p.name }))} placeholder="Seleziona..." required />
            <Select label="Cliente" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} options={[{ value: '', label: 'Nessuno' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]} placeholder="Opzionale" />
          </div>
          <Textarea label="Obiettivo" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Cosa vogliamo ottenere con questo progetto creativo?" rows={2} />
          <Textarea label="Target Audience" value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} placeholder="A chi ci rivolgiamo? Età, interessi, comportamenti..." rows={2} />
          <Textarea label="Messaggio Chiave" value={form.key_message} onChange={(e) => setForm({ ...form, key_message: e.target.value })} placeholder="Qual è il messaggio principale da comunicare?" rows={2} />
          <Input label="Tone of Voice" value={form.tone_of_voice} onChange={(e) => setForm({ ...form, tone_of_voice: e.target.value })} placeholder="Es: Professionale ma accessibile, giovane, ironico..." />
          <Textarea label="Deliverable" value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} placeholder="Lista dei deliverable attesi (es: 5 post Instagram, 1 video reel, 2 stories)" rows={3} />
          <div className="grid grid-cols-2 gap-4">
            <Textarea label="Da Fare (DO)" value={form.do_list} onChange={(e) => setForm({ ...form, do_list: e.target.value })} placeholder="Cosa deve essere fatto..." rows={3} />
            <Textarea label="Da NON Fare (DON'T)" value={form.dont_list} onChange={(e) => setForm({ ...form, dont_list: e.target.value })} placeholder="Cosa evitare..." rows={3} />
          </div>
          <Textarea label="Link Riferimenti (uno per riga)" value={form.references_urls} onChange={(e) => setForm({ ...form, references_urls: e.target.value })} placeholder="https://pinterest.com/pin/...&#10;https://figma.com/file/..." rows={3} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            <Input label="Note Budget" value={form.budget_notes} onChange={(e) => setForm({ ...form, budget_notes: e.target.value })} placeholder="Es: Max €500 per foto stock" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button>
            <Button onClick={handleCreate}>Crea Brief</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-pw-text flex items-center gap-1.5 mb-1.5">
        <Icon size={12} className="text-pw-accent" />
        {title}
      </p>
      {children}
    </div>
  );
}
