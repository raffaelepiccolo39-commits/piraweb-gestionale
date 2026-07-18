'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { getRoleLabel } from '@/lib/utils';
import { PRIORITY_OPTIONS } from '@/lib/constants';
import { reportSupabaseError, reportError } from '@/lib/report-error';
import { Sparkles, ShieldCheck, Wand2, Check, MessageSquarePlus } from 'lucide-react';

/**
 * Cattura rapida (admin): incolla un messaggio (es. inoltrato da un cliente su
 * WhatsApp), l'AI propone una o più task indovinando cliente e assegnatario.
 * L'admin conferma o corregge, poi crea. Fase 1 del flusso WhatsApp→task.
 */

interface ProposedTask {
  title: string;
  description: string;
  assigned_to: string | null;
  priority: string;
  estimated_hours: number | null;
  deadline: string | null;
  created: boolean;
}

export default function CatturaPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [message, setMessage] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [tasks, setTasks] = useState<ProposedTask[]>([]);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);

  const [clients, setClients] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; client_id: string | null }[]>([]);
  const [team, setTeam] = useState<{ id: string; full_name: string; role: string }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [cRes, pRes, tRes] = await Promise.all([
        supabase.from('clients').select('id, name, company').eq('is_active', true).is('paused_at', null).order('company'),
        supabase.from('projects').select('id, name, client_id').eq('status', 'active').order('name'),
        supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name'),
      ]);
      setClients((cRes.data as typeof clients) ?? []);
      setProjects((pRes.data as typeof projects) ?? []);
      setTeam((tRes.data as typeof team) ?? []);
    })();
  }, [supabase, isAdmin]);

  const clientOptions = useMemo(
    () => [{ value: '', label: 'Nessun cliente' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))],
    [clients],
  );
  const projectOptions = useMemo(() => {
    const list = clientId ? projects.filter((p) => p.client_id === clientId) : projects;
    return [{ value: '', label: 'Scegli un progetto' }, ...list.map((p) => ({ value: p.id, label: p.name }))];
  }, [projects, clientId]);
  const teamOptions = useMemo(
    () => [{ value: '', label: 'Nessuno' }, ...team.map((m) => ({ value: m.id, label: `${m.full_name} (${getRoleLabel(m.role)})` }))],
    [team],
  );

  // Se il cliente scelto ha un solo progetto, selezionalo da solo.
  useEffect(() => {
    if (!clientId) return;
    const forClient = projects.filter((p) => p.client_id === clientId);
    if (forClient.length === 1) setProjectId(forClient[0].id);
  }, [clientId, projects]);

  async function analyze() {
    if (!message.trim()) { toast.error('Incolla prima un messaggio'); return; }
    setAnalyzing(true);
    setTasks([]);
    try {
      const res = await fetch('/api/ai/capture-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Errore AI'); return; }
      setClientId(data.client_id || '');
      setTasks((data.tasks as Omit<ProposedTask, 'created'>[]).map((t) => ({ ...t, created: false })));
      if (!data.tasks?.length) toast.error('Non ho trovato attività nel messaggio');
    } catch (err) {
      reportError({ message: `capture-task fetch: ${String(err)}`, route: '/cattura' });
      toast.error('Errore di rete, riprova');
    } finally {
      setAnalyzing(false);
    }
  }

  function patch(idx: number, field: keyof ProposedTask, value: string | null) {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function createTask(idx: number) {
    if (!profile) return;
    if (!projectId) { toast.error('Scegli un progetto per la task'); return; }
    const t = tasks[idx];
    if (!t.title.trim()) { toast.error('La task ha bisogno di un titolo'); return; }

    setCreatingIdx(idx);
    const { data: created, error } = await supabase
      .from('tasks')
      .insert({
        title: t.title.trim(),
        description: t.description?.trim() || null,
        project_id: projectId,
        assigned_to: t.assigned_to || null,
        priority: t.priority,
        status: 'todo',
        deadline: t.deadline || null,
        estimated_hours: t.estimated_hours ?? null,
        position: idx,
        created_by: profile.id,
      })
      .select('id')
      .single();

    if (error || !created) {
      setCreatingIdx(null);
      reportSupabaseError(error, 'cattura-crea-task');
      toast.error('Errore nella creazione della task');
      return;
    }
    if (t.assigned_to) {
      await supabase.rpc('set_task_assignees', { p_task_id: created.id, p_user_ids: [t.assigned_to] });
    }
    setCreatingIdx(null);
    setTasks((prev) => prev.map((x, i) => (i === idx ? { ...x, created: true } : x)));
    toast.success('Task creata');
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Area riservata"
        description="La cattura rapida è disponibile solo agli amministratori."
      />
    );
  }

  const pending = tasks.filter((t) => !t.created);

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        eyebrow="Task"
        title="Cattura rapida"
        subtitle="Incolla un messaggio (es. inoltrato da WhatsApp): l'AI propone le task e a chi assegnarle"
      />

      <Card>
        <CardContent className="space-y-3">
          <Textarea
            rows={5}
            placeholder="Incolla qui il messaggio del cliente…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex justify-end">
            <Button variant="primary" onClick={analyze} loading={analyzing} disabled={!message.trim()}>
              <Wand2 size={16} /> Analizza messaggio
            </Button>
          </div>
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-pw-text-muted">
              <Sparkles size={16} className="text-pw-accent" />
              Proposta dell&apos;AI — controlla cliente, progetto e assegnatario prima di creare.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Cliente" options={clientOptions} value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(''); }} />
              <Select label="Progetto" options={projectOptions} value={projectId} onChange={(e) => setProjectId(e.target.value)} />
            </div>

            {pending.length === 0 ? (
              <p className="text-sm text-pw-text-dim">Tutte le task proposte sono state create. 🎉</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((t, idx) => t.created ? (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border border-pw-border bg-pw-surface px-3 py-2 text-sm text-pw-text-dim">
                    <Check size={15} className="text-pw-success" /> <span className="line-through">{t.title}</span> — creata
                  </div>
                ) : (
                  <div key={idx} className="space-y-2.5 rounded-xl border border-pw-border p-3">
                    <Input value={t.title} onChange={(e) => patch(idx, 'title', e.target.value)} placeholder="Titolo" />
                    <Textarea rows={2} value={t.description} onChange={(e) => patch(idx, 'description', e.target.value)} placeholder="Descrizione" />
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <Select label="Assegna a" options={teamOptions} value={t.assigned_to ?? ''} onChange={(e) => patch(idx, 'assigned_to', e.target.value || null)} />
                      <Select label="Priorità" options={PRIORITY_OPTIONS} value={t.priority} onChange={(e) => patch(idx, 'priority', e.target.value)} />
                      <Input label="Scadenza" type="date" value={t.deadline ?? ''} onChange={(e) => patch(idx, 'deadline', e.target.value || null)} />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="primary" loading={creatingIdx === idx} onClick={() => createTask(idx)}>
                        <MessageSquarePlus size={15} /> Crea task
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
