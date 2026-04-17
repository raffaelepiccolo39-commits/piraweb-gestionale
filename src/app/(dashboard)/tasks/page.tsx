'use client';


import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { formatDate, getPriorityColor, getStatusColor, getRoleLabel } from '@/lib/utils';
import type { Task, Project, Client } from '@/types/database';
import { useToast } from '@/components/ui/toast';
import { ListTodo, Calendar, Clock, ArrowRight, Sparkles, Brain, Check, Send, AlertTriangle, Archive, ExternalLink } from 'lucide-react';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

interface ParsedTask {
  title: string;
  description: string;
  assigned_to_role: string;
  assigned_to: string | null;
  priority: string;
  estimated_hours: number | null;
}

export default function TasksPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string; role: string; color: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('me');
  const [deadlineFilter, setDeadlineFilter] = useState('');

  // AI task creation
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiClientId, setAiClientId] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[] | null>(null);
  const [tasksSaved, setTasksSaved] = useState(false);
  const [error, setError] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const toast = useToast();

  const fetchTasks = useCallback(async () => {
    if (!profile) return;

    try {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          project:projects(id, name, color),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, color)
        `);

      // Filtro dipendente: "me" = solo i miei, "all" = tutti, UUID = specifico
      if (assigneeFilter === 'me') {
        query = query.eq('assigned_to', profile.id);
      } else if (assigneeFilter && assigneeFilter !== 'all') {
        query = query.eq('assigned_to', assigneeFilter);
      }

      query = query.order('updated_at', { ascending: false }).limit(200);

      // Escludi archiviati di default, mostrali solo se filtro esplicito
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      } else {
        query = query.neq('status', 'archived');
      }
      if (priorityFilter) query = query.eq('priority', priorityFilter);

      // Deadline filter
      if (deadlineFilter) {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        if (deadlineFilter === 'overdue') {
          query = query.not('deadline', 'is', null).lt('deadline', today);
        } else if (deadlineFilter === 'today') {
          query = query.eq('deadline', today);
        } else if (deadlineFilter === 'week') {
          const weekEnd = new Date(now);
          weekEnd.setDate(weekEnd.getDate() + 7);
          query = query.not('deadline', 'is', null).lte('deadline', weekEnd.toISOString().split('T')[0]).gte('deadline', today);
        } else if (deadlineFilter === 'month') {
          const monthEnd = new Date(now);
          monthEnd.setDate(monthEnd.getDate() + 30);
          query = query.not('deadline', 'is', null).lte('deadline', monthEnd.toISOString().split('T')[0]).gte('deadline', today);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setTasks((data as Task[]) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, statusFilter, priorityFilter, assigneeFilter, deadlineFilter]);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('is_active', true)
      .order('company');
    if (data) setClients(data as Client[]);
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, color')
      .eq('is_active', true)
      .order('full_name');
    if (data) setTeamMembers(data);
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchClients();
    fetchTeamMembers();
  }, [fetchTasks, fetchClients, fetchTeamMembers]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    // When marking as done, ask for delivery link
    if (newStatus === 'done') {
      const task = tasks.find(t => t.id === taskId);
      if (task && !task.delivery_url) {
        const link = prompt('Inserisci il link al lavoro completato (Google Drive, Figma, ecc.):');
        if (!link || !link.trim()) {
          toast.error('Link obbligatorio per completare la task');
          return;
        }
        try {
          const { error } = await supabase.from('tasks').update({ status: 'done', delivery_url: link.trim() }).eq('id', taskId);
          if (error) throw error;
          toast.success('Task completata con link al lavoro');
          fetchTasks();
        } catch {
          toast.error('Errore durante l\'aggiornamento');
        }
        return;
      }
    }

    try {
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
      if (error) throw error;
      toast.success('Stato aggiornato');
      fetchTasks();
    } catch {
      toast.error('Errore durante l\'aggiornamento dello stato');
    }
  };

  const handleAiParse = async () => {
    if (!aiInput.trim() || !aiClientId || !profile) return;
    setAiLoading(true);
    setParsedTasks(null);
    setTasksSaved(false);

    try {
      // Auto-crea progetto per il cliente se non esiste
      const { data: projectId } = await supabase.rpc('get_or_create_client_project', {
        p_client_id: aiClientId,
        p_created_by: profile.id,
      });

      if (!projectId) { setAiLoading(false); return; }

      const res = await fetch('/api/ai/parse-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: aiInput, project_id: projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setParsedTasks(data.tasks);
      } else {
        toast.error('Errore nell\'analisi AI dei task');
      }
    } catch {
      toast.error('Errore nell\'analisi AI dei task');
    } finally {
      setAiLoading(false);
    }
  };

  const getClientProjectId = async (): Promise<string | null> => {
    if (!profile || !aiClientId) return null;
    const { data } = await supabase.rpc('get_or_create_client_project', {
      p_client_id: aiClientId,
      p_created_by: profile.id,
    });
    return data;
  };

  const handleSaveTasks = async () => {
    if (!parsedTasks || !profile) return;
    setAiLoading(true);

    const projectId = await getClientProjectId();
    if (!projectId) { setAiLoading(false); return; }

    const tasksToInsert = parsedTasks.map((task, index) => ({
      title: task.title,
      description: task.description,
      project_id: projectId,
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
      toast.success('Task salvati con successo');
      fetchTasks();
      setTimeout(() => {
        setShowAiModal(false);
        setParsedTasks(null);
        setAiInput('');
        setAiClientId('');
        setTasksSaved(false);
      }, 1500);
    } else {
      toast.error('Errore durante il salvataggio dei task');
    }
    setAiLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchTasks(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            {assigneeFilter === 'me'
              ? 'I miei Task'
              : assigneeFilter === 'all'
                ? 'Tutti i Task'
                : `Task di ${teamMembers.find(m => m.id === assigneeFilter)?.full_name || 'Dipendente'}`
            }
          </h1>
          <p className="text-sm text-pw-text-muted">
            {tasks.length} task {assigneeFilter === 'me' ? 'assegnati a te' : assigneeFilter === 'all' ? 'totali' : 'assegnati'}
          </p>
        </div>
        <Button onClick={() => { setParsedTasks(null); setTasksSaved(false); setAiInput(''); setAiClientId(''); setShowAiModal(true); }}>
          <Sparkles size={16} />
          Crea Task con AI
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-52">
          <Select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            options={[
              { value: 'me', label: 'I miei Task' },
              { value: 'all', label: 'Tutti i Task' },
              ...teamMembers.filter(m => m.id !== profile?.id).map(m => ({
                value: m.id,
                label: m.full_name,
              })),
            ]}
          />
        </div>
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'todo', label: 'Da fare' },
              { value: 'in_progress', label: 'In corso' },
              { value: 'done', label: 'Fatto' },
              { value: 'archived', label: 'Archiviato' },
            ]}
            placeholder="Tutti gli stati"
          />
        </div>
        <div className="w-44">
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            options={[
              { value: 'low', label: 'Bassa' },
              { value: 'medium', label: 'Media' },
              { value: 'high', label: 'Alta' },
              { value: 'urgent', label: 'Urgente' },
            ]}
            placeholder="Tutte le priorità"
          />
        </div>
        <div className="w-48">
          <Select
            value={deadlineFilter}
            onChange={(e) => setDeadlineFilter(e.target.value)}
            options={[
              { value: 'overdue', label: 'Scadute' },
              { value: 'today', label: 'Scadenza oggi' },
              { value: 'week', label: 'Prossimi 7 giorni' },
              { value: 'month', label: 'Prossimi 30 giorni' },
            ]}
            placeholder="Tutte le scadenze"
          />
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nessun task"
          description={
            statusFilter || priorityFilter
              ? 'Nessun task corrisponde ai filtri selezionati'
              : 'Non ci sono task al momento. Usa "Crea Task con AI" per iniziare.'
          }
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const project = task.project as { id: string; name: string; color: string } | undefined;
            const assignee = task.assignee as { id: string; full_name: string } | undefined;
            return (
              <Card key={task.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {project && (
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                        )}
                        <span className="text-xs text-pw-text-muted truncate">
                          {project?.name || 'Cliente'}
                        </span>
                        {assignee && assigneeFilter !== 'me' && (
                          <span className="text-xs text-pw-text-dim">
                            · {assignee.full_name}
                          </span>
                        )}
                        {task.ai_generated && (
                          <Sparkles size={10} className="text-pw-accent shrink-0" />
                        )}
                      </div>
                      <h3 className="font-medium text-pw-text mb-2">
                        <a href={`/tasks/${task.id}`} className="hover:text-pw-accent transition-colors">
                          {task.title}
                        </a>
                      </h3>
                      {task.description && (
                        <p className="text-xs text-pw-text-muted mb-2 line-clamp-1">{task.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={getStatusColor(task.status)}>
                          {STATUS_LABELS[task.status]}
                        </Badge>
                        <Badge className={getPriorityColor(task.priority)}>
                          {PRIORITY_LABELS[task.priority]}
                        </Badge>
                        {task.deadline && (
                          <span className="flex items-center gap-1 text-xs text-pw-text-muted">
                            <Calendar size={12} />
                            {formatDate(task.deadline)}
                          </span>
                        )}
                        {task.estimated_hours && (
                          <span className="flex items-center gap-1 text-xs text-pw-text-muted">
                            <Clock size={12} />
                            {task.estimated_hours}h
                          </span>
                        )}
                        {task.delivery_url && (
                          <a
                            href={task.delivery_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-pw-accent hover:underline"
                          >
                            <ExternalLink size={12} />
                            {task.delivery_url.includes('drive.google') ? 'Google Drive' :
                             task.delivery_url.includes('figma.com') ? 'Figma' :
                             task.delivery_url.includes('canva.com') ? 'Canva' :
                             'Link lavoro'}
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text-muted"
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {task.status !== 'archived' && (
                        <button
                          onClick={() => handleStatusChange(task.id, 'archived')}
                          className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-accent"
                          title="Archivia task"
                        >
                          <Archive size={16} />
                        </button>
                      )}
                      {project && (
                        <button
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2"
                          title="Vai al progetto"
                        >
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* AI Task Creation Modal */}
      <Modal
        open={showAiModal}
        onClose={() => setShowAiModal(false)}
        title="Crea Task con AI"
        size="lg"
      >
        <div className="space-y-4">
          {!parsedTasks ? (
            <>
              <div className="p-3 rounded-xl bg-pw-accent/10 text-pw-accent text-sm">
                Descrivi in linguaggio naturale cosa va fatto. L&apos;AI creerà i task e li assegnerà automaticamente al membro del team più adatto.
              </div>

              <Select
                id="ai-client"
                label="Cliente *"
                value={aiClientId}
                onChange={(e) => setAiClientId(e.target.value)}
                options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
                placeholder="Seleziona cliente"
              />

              <div>
                <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">
                  Cosa bisogna fare? *
                </label>
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="es. Dobbiamo creare 3 post Instagram per il lancio del nuovo prodotto, scrivere un articolo blog sulla sostenibilità e preparare la newsletter mensile per i clienti VIP..."
                  rows={5}
                  className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all text-sm resize-none"
                />
              </div>

              <Button
                onClick={handleAiParse}
                loading={aiLoading}
                disabled={!aiInput.trim() || !aiClientId}
                className="w-full"
              >
                <Brain size={16} />
                Analizza e Crea Task
              </Button>
            </>
          ) : (
            <>
              {tasksSaved ? (
                <div className="p-4 rounded-xl bg-green-500/10 text-green-400 text-center">
                  <Check size={32} className="mx-auto mb-2" />
                  <p className="font-semibold">Task salvati con successo!</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-pw-text">
                      {parsedTasks.length} task generati
                    </p>
                    <Button onClick={handleSaveTasks} loading={aiLoading}>
                      <Check size={14} />
                      Salva tutti
                    </Button>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {parsedTasks.map((task, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-xl border border-pw-border bg-pw-surface-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h4 className="font-medium text-pw-text">{task.title}</h4>
                            <p className="text-sm text-pw-text-muted mt-1">{task.description}</p>
                          </div>
                          <Badge className="bg-indigo-500/15 text-indigo-400 shrink-0">
                            {getRoleLabel(task.assigned_to_role)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-pw-text-muted">
                          <span>Priorità: {PRIORITY_LABELS[task.priority] || task.priority}</span>
                          {task.estimated_hours && <span>~{task.estimated_hours}h</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => { setParsedTasks(null); setTasksSaved(false); }}
                    className="w-full"
                  >
                    Modifica la richiesta
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
