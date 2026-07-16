'use client';


import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { formatDate, getPriorityTone, getStatusTone, getRoleLabel, formatDateLocal, todayLocal, stripHtml } from '@/lib/utils';
import type { Task, Project, Client, Profile } from '@/types/database';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { useToast } from '@/components/ui/toast';
import { SkeletonList, SkeletonStats } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ListTodo, Calendar, Clock, ArrowRight, Sparkles, Brain, Check, Send, AlertTriangle, Archive, ArchiveRestore, ExternalLink } from 'lucide-react';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { reportUnknown, reportSupabaseError } from '@/lib/report-error';

interface ParsedTask {
  title: string;
  description: string;
  assigned_to_role: string;
  assigned_to: string | null;
  priority: string;
  estimated_hours: number | null;
}

// Colore del bordo card per stato: panoramica visiva immediata
const STATUS_BORDER: Record<string, string> = {
  todo: 'border-l-slate-400',
  in_progress: 'border-l-blue-400',
  review: 'border-l-amber-400',
  done: 'border-l-green-500',
};

export default function TasksPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('me');
  // Default "Tutti" per gli admin (creano task per il team e se li aspettano
  // visibili subito); "Solo i miei" per gli altri. Applicato una sola volta al
  // primo caricamento del profilo, così non sovrascrive le scelte manuali.
  const didInitAssignee = useRef(false);
  useEffect(() => {
    if (profile && !didInitAssignee.current) {
      didInitAssignee.current = true;
      if (profile.role === 'admin') setAssigneeFilter('all');
    }
  }, [profile]);
  const searchParams = useSearchParams();
  const groupMode: 'none' | 'sector' = searchParams.get('group') === 'sector' ? 'sector' : 'none';
  // Filtri iniziali da query param (es. link dalle card della dashboard)
  const initialFilterValues = useMemo(() => {
    const v: Record<string, string> = {};
    const status = searchParams.get('status');
    const deadline = searchParams.get('deadline');
    if (status) v.status = status;
    if (deadline) v.deadline = deadline;
    return v;
  }, [searchParams]);

  // AI task creation
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiClientId, setAiClientId] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[] | null>(null);
  const [tasksSaved, setTasksSaved] = useState(false);
  const [error, setError] = useState(false);

  // Delivery URL modal (replaces prompt())
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const toast = useToast();

  // Le fetch partono in parallelo quando cambia il filtro (per gli admin
  // assigneeFilter passa da 'me' ad 'all' appena arriva il profilo). Senza
  // questo contatore vinceva l'ULTIMA risposta arrivata, non l'ultima
  // richiesta: la fetch 'me' poteva atterrare dopo quella 'all' e sovrascrivere
  // tutte le task con il proprio risultato (per un admin con task solo
  // archiviate: zero). Scrive nello stato solo la richiesta più recente.
  const fetchSeq = useRef(0);

  const fetchTasks = useCallback(async () => {
    if (!profile) return;

    const seq = ++fetchSeq.current;
    const isStale = () => seq !== fetchSeq.current;

    try {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          project:projects(id, name, color, client:clients(id, name, company, sector)),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, color)
        `);

      // Filtro dipendente: "me" = solo i miei, "all" = tutti, UUID = specifico.
      // Multi-assegnatario: filtro via junction (pre-carico gli id delle task
      // in cui la persona è assegnata).
      if (assigneeFilter === 'me' || (assigneeFilter && assigneeFilter !== 'all')) {
        const targetId = assigneeFilter === 'me' ? profile.id : assigneeFilter;
        const { data: myTaskRows } = await supabase.from('task_assignees').select('task_id').eq('user_id', targetId);
        const ids = (myTaskRows || []).map((r) => r.task_id as string);
        query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      }

      // Archivio: di default mostra solo le attive (archived_at IS NULL).
      // Con "Mostra archiviati" attivo mostra solo le archiviate.
      query = (showArchived
        ? query.not('archived_at', 'is', null)
        : query.is('archived_at', null)
      ).order('updated_at', { ascending: false }).limit(500);

      const { data, error } = await query;
      if (error) throw error;
      if (isStale()) return;
      setTasks((data as Task[]) || []);
    } catch (err) {
      if (isStale()) return;
      reportUnknown(err, 'client', { op: 'tasks-fetch' });
      setError(true);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [profile, isAdmin, assigneeFilter, showArchived]);

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
      .select('*')
      .eq('is_active', true)
      .order('full_name');
    if (data) setTeamMembers(data as Profile[]);
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchClients();
    fetchTeamMembers();
  }, [fetchTasks, fetchClients, fetchTeamMembers]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
    if (error) {
      reportSupabaseError(error, 'tasks-status-change', { taskId, newStatus });
      // Mostra il messaggio reale del DB (es. blocco "registra le ore prima di
      // completare"), altrimenti l'utente non capisce perché non riesce.
      toast.error(error.message || 'Errore durante l\'aggiornamento dello stato');
      return;
    }
    if (newStatus === 'done') {
      const task = tasks.find(t => t.id === taskId);
      toast.success(task?.delivery_url
        ? 'Task completata'
        : 'Task completata — se vuoi, aggiungi il link al lavoro dal dettaglio');
    } else {
      toast.success('Stato aggiornato');
    }
    fetchTasks();
  };

  const handleArchive = async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', taskId);
    if (error) { reportSupabaseError(error, 'tasks-archive', { taskId }); toast.error('Errore durante l\'archiviazione'); return; }
    toast.success('Task archiviata');
    fetchTasks();
  };

  const handleRestore = async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ archived_at: null }).eq('id', taskId);
    if (error) { reportSupabaseError(error, 'tasks-restore', { taskId }); toast.error('Errore durante il ripristino'); return; }
    toast.success('Task ripristinata');
    fetchTasks();
  };

  const handleAiParse = async () => {
    if (!aiInput.trim() || !aiClientId || !profile) return;
    setAiLoading(true);
    setParsedTasks(null);
    setTasksSaved(false);

    // Timeout di sicurezza: se la richiesta non risponde entro 70s la
    // interrompiamo, così lo spinner non gira all'infinito.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70_000);

    try {
      // Auto-crea progetto per il cliente se non esiste
      const { data: projectId, error: rpcError } = await supabase.rpc('get_or_create_client_project', {
        p_client_id: aiClientId,
        p_created_by: profile.id,
      });

      if (rpcError || !projectId) {
        reportSupabaseError(rpcError, 'tasks-ai-get-project', { clientId: aiClientId });
        toast.error('Impossibile creare il progetto per il cliente selezionato');
        return;
      }

      const res = await fetch('/api/ai/parse-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: aiInput, project_id: projectId }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setParsedTasks(data.tasks);
      } else {
        toast.error(data.error || 'Errore nell\'analisi AI dei task');
      }
    } catch (err) {
      reportUnknown(err, 'client', { op: 'tasks-ai-parse' });
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('L\'AI ci sta mettendo troppo. Riprova con una richiesta più breve.');
      } else {
        toast.error('Errore nell\'analisi AI dei task');
      }
    } finally {
      clearTimeout(timeout);
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
      reportSupabaseError(error, 'tasks-ai-salva');
      toast.error('Errore durante il salvataggio dei task');
    }
    setAiLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={4} />
        <SkeletonList variant="row" count={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchTasks(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title={
          assigneeFilter === 'me'
            ? 'I miei Task'
            : assigneeFilter === 'all'
              ? 'Tutti i Task'
              : `Task di ${teamMembers.find(m => m.id === assigneeFilter)?.full_name || 'Dipendente'}`
        }
        subtitle={`${tasks.length} task ${assigneeFilter === 'me' ? 'assegnati a te' : assigneeFilter === 'all' ? 'totali' : 'assegnati'}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowArchived((v) => !v)}>
              <Archive size={14} />
              {showArchived ? 'Mostra attivi' : 'Mostra archiviati'}
            </Button>
            <Button variant="primary" onClick={() => { setParsedTasks(null); setTasksSaved(false); setAiInput(''); setAiClientId(''); setShowAiModal(true); }}>
              <Sparkles size={14} />
              Crea Task con AI
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3 mb-6 mt-6">
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
      </div>

      <DataTable
        data={tasks}
        rowKey={(t) => t.id}
        columns={[]}
        variant="card"
        cardGridClassName="space-y-3"
        groupBy={groupMode === 'sector' ? (t) => {
          const client = (t.project as { client?: { sector?: string | null } } | undefined)?.client;
          return client?.sector?.trim() || '__none__';
        } : undefined}
        groupLabel={(key) => (key === '__none__' ? 'Senza settore' : key)}
        searchKeys={[
          (t) => t.title,
          (t) => stripHtml(t.description),
          (t) => (t.project as { name?: string } | undefined)?.name || '',
          (t) => (t.project as { client?: { company?: string; name?: string } } | undefined)?.client?.company || '',
        ]}
        searchPlaceholder="Cerca per titolo, descrizione, progetto o cliente…"
        initialFilterValues={initialFilterValues}
        filters={[
          {
            key: 'status',
            label: 'Tutti gli stati',
            options: [
              { value: 'todo', label: 'Da fare' },
              { value: 'in_progress', label: 'In corso' },
              { value: 'review', label: 'Review' },
              { value: 'done', label: 'Fatto' },
            ],
            accessor: (t) => t.status,
          },
          {
            key: 'priority',
            label: 'Tutte le priorità',
            options: [
              { value: 'low', label: 'Bassa' },
              { value: 'medium', label: 'Media' },
              { value: 'high', label: 'Alta' },
              { value: 'urgent', label: 'Urgente' },
            ],
            accessor: (t) => t.priority,
          },
          {
            key: 'deadline',
            label: 'Tutte le scadenze',
            options: [
              { value: 'overdue', label: 'Scadute' },
              { value: 'today', label: 'Scadenza oggi' },
              { value: 'week', label: 'Prossimi 7 giorni' },
              { value: 'month', label: 'Prossimi 30 giorni' },
            ],
            accessor: (t) => {
              if (!t.deadline) return '';
              const today = todayLocal();
              const d = (t.deadline as string).split('T')[0];
              if (d < today) return 'overdue';
              if (d === today) return 'today';
              const week = new Date();
              week.setDate(week.getDate() + 7);
              if (d <= formatDateLocal(week)) return 'week';
              const month = new Date();
              month.setDate(month.getDate() + 30);
              if (d <= formatDateLocal(month)) return 'month';
              return '';
            },
          },
        ]}
        emptyState={{
          icon: ListTodo,
          title: 'Nessun task',
          description: 'Non ci sono task al momento. Usa "Crea Task con AI" per iniziare.',
        }}
        cardRender={(task) => {
          const project = task.project as { id: string; name: string; color: string } | undefined;
          const assignee = task.assignee as { id: string; full_name: string } | undefined;
          return (
            <Card hover onClick={() => setSelectedTask(task)} className={`cursor-pointer border-l-4 ${STATUS_BORDER[task.status] ?? 'border-l-transparent'}`}>
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
                        <button
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="text-left hover:text-pw-accent transition-colors duration-200 ease-out"
                        >
                          {task.title}
                        </button>
                      </h3>
                      {task.description && (
                        <p className="text-xs text-pw-text-muted mb-2 line-clamp-1">{stripHtml(task.description)}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={getStatusTone(task.status)} dot>
                          {STATUS_LABELS[task.status]}
                        </Badge>
                        <Badge tone={getPriorityTone(task.priority)}>
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

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text-muted"
                      >
                        {Object.entries(STATUS_LABELS)
                          .filter(([value]) => value !== 'archived')
                          .map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                      </select>
                      {task.archived_at ? (
                        <button
                          onClick={() => handleRestore(task.id)}
                          className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-accent"
                          title="Ripristina task"
                        >
                          <ArchiveRestore size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmArchiveId(task.id)}
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
          }}
      />

      {/* Task detail pop-up (unico, condiviso con Bacheca e Progetti) */}
      <TaskDetailModal
        task={selectedTask}
        members={teamMembers}
        clients={clients}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={() => { setSelectedTask(null); fetchTasks(); }}
      />

      {/* Conferma archiviazione task */}
      <ConfirmDialog
        open={confirmArchiveId !== null}
        onClose={() => setConfirmArchiveId(null)}
        onConfirm={() => {
          if (confirmArchiveId) handleArchive(confirmArchiveId);
          setConfirmArchiveId(null);
        }}
        title="Archivia task"
        description="Vuoi archiviare questa task? Potrai ritrovarla con “Mostra archiviati” e ripristinarla quando vuoi."
        confirmLabel="Archivia"
      />


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
                  className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 ease-out text-sm resize-none"
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
                            <p className="text-sm text-pw-text-muted mt-1">{stripHtml(task.description)}</p>
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
