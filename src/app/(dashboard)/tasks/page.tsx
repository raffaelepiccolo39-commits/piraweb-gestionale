'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DropResult } from '@hello-pangea/dnd';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkeletonList } from '@/components/ui/skeleton';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { TaskForm, type TaskFormData } from '@/components/tasks/task-form';
import { BachecaPersone, assegnatariDi } from '@/components/tasks/bacheca-persone';
import { ElencoTask } from '@/components/tasks/elenco-task';
import { cn, getRoleLabel, safeStorageName, stripHtml } from '@/lib/utils';
import { PRIORITY_LABELS } from '@/lib/constants';
import type { Task, Project, Client, Profile } from '@/types/database';
import { reportUnknown, reportSupabaseError } from '@/lib/report-error';
import {
  AlertTriangle, Archive, Brain, Check, CheckCircle2, Sparkles,
} from 'lucide-react';

type Vista = 'bacheca' | 'elenco';

interface TaskAnalizzata {
  title: string;
  description: string;
  assigned_to_role: string;
  assigned_to: string | null;
  priority: string;
  estimated_hours: number | null;
}

/**
 * Bacheca — l'unico posto dove stanno le task.
 *
 * Prima erano due pagine: /bacheca (kanban per persona, per smistare) e
 * /tasks (elenco con ricerca e filtri, per ritrovare). Facevano cose diverse
 * sugli stessi dati, ma una delle due non era nemmeno nel menu e ci si
 * arrivava per caso. Ora sono due viste della stessa pagina, e i filtri
 * valgono per entrambe.
 *
 * L'indirizzo resta /tasks: ci puntano le card della dashboard con i filtri
 * già impostati, la scorciatoia dell'app e il widget del profilo. /bacheca
 * reindirizza qui.
 */
export default function BachecaPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vista, setVista] = useState<Vista>('bacheca');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [membri, setMembri] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState(false);

  // Filtro assegnatario: vale solo nell'elenco. Nella bacheca le colonne SONO
  // le persone, filtrarle svuoterebbe la vista invece di restringerla.
  // null = non ancora toccato dall'utente, si usa il valore predefinito del ruolo.
  const [filtroScelto, setFiltroScelto] = useState<string | null>(null);
  const [mostraArchiviate, setMostraArchiviate] = useState(false);

  const [taskAperta, setTaskAperta] = useState<Task | null>(null);
  const [confermaArchiviaId, setConfermaArchiviaId] = useState<string | null>(null);
  const [confermaArchiviaFatte, setConfermaArchiviaFatte] = useState(false);

  // Creazione manuale (dalla colonna di una persona)
  const [mostraNuova, setMostraNuova] = useState(false);
  const [nuovaPerMembro, setNuovaPerMembro] = useState<string | null>(null);

  // Creazione con AI
  const [mostraAi, setMostraAi] = useState(false);
  const [aiTesto, setAiTesto] = useState('');
  const [aiCliente, setAiCliente] = useState('');
  const [aiInCorso, setAiInCorso] = useState(false);
  const [aiProposte, setAiProposte] = useState<TaskAnalizzata[] | null>(null);
  const [aiSalvate, setAiSalvate] = useState(false);

  const isAdmin = profile?.role === 'admin';

  // Gli admin creano task per il team e se le aspettano visibili subito;
  // gli altri partono dalle proprie.
  const filtroAssegnatario = filtroScelto ?? (isAdmin ? 'all' : 'me');

  const perSettore = searchParams.get('group') === 'sector';
  const filtriIniziali = useMemo(() => {
    const v: Record<string, string> = {};
    const status = searchParams.get('status');
    const deadline = searchParams.get('deadline');
    if (status) v.status = status;
    if (deadline) v.deadline = deadline;
    return v;
  }, [searchParams]);

  // Una richiesta per volta: scrive solo la più recente, così cambiando
  // filtro in fretta non vince una risposta vecchia.
  const seqRef = useRef(0);

  const carica = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const base = supabase
        .from('tasks')
        .select(`
          *,
          project:projects(id, name, color, client_id, client:clients(id, name, company, logo_url, sector)),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, color),
          task_assignees(user_id)
        `);

      // O le attive o le archiviate, mai insieme: mescolarle rende l'elenco
      // illeggibile e la bacheca piena di roba chiusa.
      const query = mostraArchiviate
        ? base.not('archived_at', 'is', null)
        : base.is('archived_at', null);

      const [tasksRes, membriRes, clientiRes] = await Promise.all([
        query.order('updated_at', { ascending: false }).limit(2000),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
        supabase.from('clients').select('*').eq('is_active', true).order('company'),
      ]);

      if (seq !== seqRef.current) return;
      if (tasksRes.error) throw tasksRes.error;

      setTasks((tasksRes.data as Task[]) || []);
      setMembri((membriRes.data as Profile[]) || []);
      setClients((clientiRes.data as Client[]) || []);
    } catch (e) {
      if (seq !== seqRef.current) return;
      reportUnknown(e, 'client', { op: 'bacheca-fetch' });
      setErrore(true);
    } finally {
      if (seq === seqRef.current) setCaricamento(false);
    }
  }, [supabase, mostraArchiviate]);

  useEffect(() => { void carica(); }, [carica]);

  /** L'elenco rispetta il filtro assegnatario; la bacheca no. */
  const taskDellElenco = useMemo(() => {
    if (filtroAssegnatario === 'all') return tasks;
    const target = filtroAssegnatario === 'me' ? profile?.id : filtroAssegnatario;
    if (!target) return tasks;
    return tasks.filter((t) => assegnatariDi(t).includes(target));
  }, [tasks, filtroAssegnatario, profile?.id]);

  const completate = useMemo(() => tasks.filter((t) => t.status === 'done').length, [tasks]);
  const attive = useMemo(() => tasks.filter((t) => t.status !== 'done').length, [tasks]);

  // ── Azioni ───────────────────────────────────────────────

  const cambiaStato = async (taskId: string, stato: string) => {
    const { error } = await supabase.from('tasks').update({ status: stato }).eq('id', taskId);
    if (error) {
      reportSupabaseError(error, 'tasks-status-change', { taskId, stato });
      // Il messaggio del database è quello utile (es. il blocco sulle ore):
      // sostituirlo con uno generico lascerebbe l'utente senza spiegazione.
      toast.error(error.message || 'Errore durante l\'aggiornamento dello stato');
      return;
    }
    if (stato === 'done') {
      const task = tasks.find((t) => t.id === taskId);
      toast.success(task?.delivery_url
        ? 'Task completata'
        : 'Task completata — se vuoi, aggiungi il link al lavoro dal dettaglio');
    } else {
      toast.success('Stato aggiornato');
    }
    void carica();
  };

  const archivia = async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', taskId);
    if (error) { reportSupabaseError(error, 'tasks-archive', { taskId }); toast.error('Errore durante l\'archiviazione'); return; }
    toast.success('Task archiviata');
    void carica();
  };

  const ripristina = async (taskId: string) => {
    const { error } = await supabase.from('tasks').update({ archived_at: null }).eq('id', taskId);
    if (error) { reportSupabaseError(error, 'tasks-restore', { taskId }); toast.error('Errore durante il ripristino'); return; }
    toast.success('Task ripristinata');
    void carica();
  };

  const archiviaCompletate = async () => {
    const ids = tasks.filter((t) => t.status === 'done').map((t) => t.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).in('id', ids);
    if (error) { reportSupabaseError(error, 'bacheca-archivia-completate'); toast.error('Errore durante l\'archiviazione'); return; }
    toast.success(`${ids.length} task archiviate`);
    void carica();
  };

  /** Trascinamento nella bacheca: su una persona riassegna, su Urgente marca urgente. */
  const sposta = async (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const versoUrgente = destination.droppableId === 'urgent';
    const nuovoAssegnatario = versoUrgente ? null : destination.droppableId;

    const modifiche: Record<string, unknown> = { position: destination.index };
    if (versoUrgente) {
      modifiche.priority = 'urgent';
    } else {
      modifiche.assigned_to = nuovoAssegnatario;
      // Uscendo dagli urgenti la priorità non resta 'urgent', altrimenti la
      // card rimbalzerebbe nella colonna rossa al primo ricaricamento.
      const task = tasks.find((t) => t.id === draggableId);
      if (task?.priority === 'urgent') modifiche.priority = 'high';
    }

    const { error } = await supabase.from('tasks').update(modifiche).eq('id', draggableId);
    if (error) {
      reportUnknown(error, 'client', { stage: 'drag_drop' });
      toast.error(error.message || 'Errore nello spostamento della task');
    } else if (nuovoAssegnatario) {
      // Riassegnare significa riassegnare a lei sola: senza questo la task
      // resterebbe anche nelle colonne dei vecchi assegnatari.
      await supabase.rpc('set_task_assignees', { p_task_id: draggableId, p_user_ids: [nuovoAssegnatario] });
    }
    // Si ricarica comunque: in caso di rifiuto la card torna dov'era.
    void carica();
  };

  const apriNuova = (membroId: string | null) => {
    setNuovaPerMembro(membroId);
    setMostraNuova(true);
  };

  const vaiAllaVista = (v: Vista) => {
    setVista(v);
    // L'archivio ha senso nell'elenco; una bacheca di task archiviate no.
    if (v === 'bacheca') setMostraArchiviate(false);
  };

  // ── Creazione con AI ─────────────────────────────────────

  const progettoDelCliente = async (): Promise<string | null> => {
    if (!profile || !aiCliente) return null;
    const { data } = await supabase.rpc('get_or_create_client_project', {
      p_client_id: aiCliente,
      p_created_by: profile.id,
    });
    return data;
  };

  const analizzaConAi = async () => {
    if (!aiTesto.trim() || !aiCliente || !profile) return;
    setAiInCorso(true);
    setAiProposte(null);
    setAiSalvate(false);

    // Senza questo lo spinner girerebbe all'infinito quando l'AI non risponde.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70_000);

    try {
      const projectId = await progettoDelCliente();
      if (!projectId) {
        toast.error('Impossibile creare il progetto per il cliente selezionato');
        return;
      }

      const res = await fetch('/api/ai/parse-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: aiTesto, project_id: projectId }),
        signal: controller.signal,
      });
      const dati = await res.json().catch(() => ({}));
      if (res.ok) setAiProposte(dati.tasks);
      else toast.error(dati.error || 'Errore nell\'analisi AI dei task');
    } catch (e) {
      reportUnknown(e, 'client', { op: 'tasks-ai-parse' });
      if (e instanceof DOMException && e.name === 'AbortError') {
        toast.error('L\'AI ci sta mettendo troppo. Riprova con una richiesta più breve.');
      } else {
        toast.error('Errore nell\'analisi AI dei task');
      }
    } finally {
      clearTimeout(timeout);
      setAiInCorso(false);
    }
  };

  const salvaProposteAi = async () => {
    if (!aiProposte || !profile) return;
    setAiInCorso(true);

    const projectId = await progettoDelCliente();
    if (!projectId) { setAiInCorso(false); return; }

    const daInserire = aiProposte.map((t, i) => ({
      title: t.title,
      description: t.description,
      project_id: projectId,
      assigned_to: t.assigned_to,
      priority: t.priority,
      status: 'todo' as const,
      position: i,
      estimated_hours: t.estimated_hours,
      ai_generated: true,
      created_by: profile.id,
    }));

    const { error } = await supabase.from('tasks').insert(daInserire);
    if (error) {
      reportSupabaseError(error, 'tasks-ai-salva');
      toast.error('Errore durante il salvataggio dei task');
    } else {
      setAiSalvate(true);
      toast.success('Task salvati con successo');
      void carica();
      setTimeout(() => {
        setMostraAi(false);
        setAiProposte(null);
        setAiTesto('');
        setAiCliente('');
        setAiSalvate(false);
      }, 1500);
    }
    setAiInCorso(false);
  };

  // ── Creazione manuale ────────────────────────────────────

  const creaTask = async (dati: TaskFormData, files?: File[]) => {
    if (!profile) return;
    try {
      let projectId: string | null = null;

      if (dati.client_id) {
        const { data: pid, error: rpcErr } = await supabase.rpc('get_or_create_client_project', {
          p_client_id: dati.client_id,
          p_created_by: profile.id,
        });
        if (rpcErr) throw rpcErr;
        projectId = pid;
      }

      // Senza cliente la task finisce nel progetto "Generale", che si crea
      // alla prima occorrenza: tasks.project_id è NOT NULL.
      if (!projectId) {
        const { data: generale, error: selErr } = await supabase
          .from('projects').select('id').eq('name', 'Generale').maybeSingle();
        if (selErr) throw selErr;
        if (generale) {
          projectId = generale.id;
        } else {
          const { data: creato, error: projErr } = await supabase
            .from('projects')
            .insert({ name: 'Generale', status: 'active', color: '#FFD108', created_by: profile.id })
            .select().single();
          if (projErr) throw projErr;
          projectId = (creato as Project | null)?.id || null;
        }
      }
      if (!projectId) throw new Error('Impossibile determinare il progetto per la task');

      const { data: creata, error: taskErr } = await supabase.from('tasks').insert({
        title: dati.title,
        description: dati.description || null,
        project_id: projectId,
        assigned_to: dati.assigned_to || nuovaPerMembro,
        priority: dati.priority,
        deadline: dati.deadline || null,
        estimated_hours: dati.estimated_hours ? Number(dati.estimated_hours) : null,
        status: dati.status || 'todo',
        position: 0,
        created_by: profile.id,
      }).select('id').single();
      if (taskErr) throw taskErr;

      if (creata) {
        const principale = dati.assigned_to || nuovaPerMembro || '';
        const ids = dati.assignee_ids?.length ? dati.assignee_ids : (principale ? [principale] : []);
        if (ids.length > 0) {
          await supabase.rpc('set_task_assignees', { p_task_id: creata.id, p_user_ids: ids });
        }
      }

      if (creata && files?.length) {
        const MAX = 10 * 1024 * 1024;
        let falliti = 0;
        let ultimoErrore = '';
        for (const file of files) {
          if (file.size > MAX) { falliti++; ultimoErrore = `"${file.name}" supera i 10MB`; continue; }
          // Il nome va sanificato: spazi, apostrofi e accenti facevano fallire l'upload.
          const path = `${creata.id}/${Date.now()}_${safeStorageName(file.name)}`;
          const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
          if (upErr) { falliti++; ultimoErrore = upErr.message; continue; }
          const { data: url } = supabase.storage.from('attachments').getPublicUrl(path);
          const { error: attErr } = await supabase.from('task_attachments').insert({
            task_id: creata.id,
            file_name: file.name,
            file_url: url.publicUrl,
            file_type: file.type,
            file_size: file.size,
            uploaded_by: profile.id,
          });
          if (attErr) { falliti++; ultimoErrore = attErr.message; }
        }
        if (falliti > 0) toast.error(`${falliti} allegato/i non caricato/i${ultimoErrore ? `: ${ultimoErrore}` : ''}`);
      }

      toast.success('Task creata');
      setMostraNuova(false);
      void carica();
    } catch (e) {
      reportUnknown(e, 'client', { op: 'bacheca-crea-task' });
      // Prima l'errore veniva ingoiato e il modal si chiudeva senza dire nulla.
      const msg = (e as { message?: string } | undefined)?.message || '';
      toast.error(
        /row-level security|permission|policy|not authorized/i.test(msg)
          ? 'Non hai i permessi per creare questa task. Contatta un amministratore.'
          : (msg || 'Errore durante la creazione della task'),
      );
    }
  };

  // ── Render ───────────────────────────────────────────────

  if (caricamento) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonList variant="card" count={6} />
      </div>
    );
  }

  if (errore) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare le task. Riprova.</p>
        <Button variant="outline" onClick={() => { setErrore(false); setCaricamento(true); void carica(); }}>
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHeader
        title="Bacheca"
        subtitle={
          mostraArchiviate
            ? `${tasks.length} task archiviate`
            : `${attive} attive · ${completate} completate`
        }
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-pw-border">
              {(['bacheca', 'elenco'] as Vista[]).map((v) => (
                <button
                  key={v}
                  onClick={() => vaiAllaVista(v)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                    vista === v ? 'bg-pw-accent text-[#0A263A]' : 'text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text',
                  )}
                >
                  {v === 'bacheca' ? 'Bacheca' : 'Elenco'}
                </button>
              ))}
            </div>

            {vista === 'elenco' && (
              <Button variant="outline" onClick={() => setMostraArchiviate((v) => !v)}>
                <Archive size={14} />
                {mostraArchiviate ? 'Mostra attive' : 'Mostra archiviate'}
              </Button>
            )}

            {vista === 'bacheca' && completate > 0 && (
              <Button variant="outline" onClick={() => setConfermaArchiviaFatte(true)}>
                <CheckCircle2 size={14} />
                Archivia {completate} completat{completate === 1 ? 'a' : 'e'}
              </Button>
            )}

            <Button
              variant="primary"
              onClick={() => { setAiProposte(null); setAiSalvate(false); setAiTesto(''); setAiCliente(''); setMostraAi(true); }}
            >
              <Sparkles size={14} />
              Crea Task con AI
            </Button>
          </>
        }
      />

      {vista === 'elenco' && (
        <div className="w-52">
          <Select
            value={filtroAssegnatario}
            onChange={(e) => setFiltroScelto(e.target.value)}
            aria-label="Filtra per assegnatario"
            options={[
              { value: 'me', label: 'Le mie task' },
              { value: 'all', label: 'Tutte le task' },
              ...membri.filter((m) => m.id !== profile?.id).map((m) => ({ value: m.id, label: m.full_name })),
            ]}
          />
        </div>
      )}

      {vista === 'bacheca' ? (
        <BachecaPersone
          tasks={tasks}
          membri={membri}
          isAdmin={isAdmin}
          onApri={setTaskAperta}
          onArchivia={archivia}
          onAggiungi={apriNuova}
          onSposta={sposta}
        />
      ) : (
        <ElencoTask
          tasks={taskDellElenco}
          soloMie={filtroAssegnatario === 'me'}
          perSettore={perSettore}
          initialFilterValues={filtriIniziali}
          onApri={setTaskAperta}
          onCambiaStato={cambiaStato}
          onArchivia={setConfermaArchiviaId}
          onRipristina={ripristina}
          onVaiAlProgetto={(id) => router.push(`/projects/scheda?id=${id}`)}
        />
      )}

      {/* Dettaglio task: lo stesso pop-up di Progetti e Calendario. */}
      <TaskDetailModal
        task={taskAperta}
        members={membri}
        clients={clients}
        open={!!taskAperta}
        onClose={() => setTaskAperta(null)}
        onUpdate={() => { setTaskAperta(null); void carica(); }}
      />

      <ConfirmDialog
        open={confermaArchiviaId !== null}
        onClose={() => setConfermaArchiviaId(null)}
        onConfirm={() => { if (confermaArchiviaId) void archivia(confermaArchiviaId); setConfermaArchiviaId(null); }}
        title="Archivia task"
        description="Vuoi archiviare questa task? Potrai ritrovarla con “Mostra archiviate” e ripristinarla quando vuoi."
        confirmLabel="Archivia"
      />

      <ConfirmDialog
        open={confermaArchiviaFatte}
        onClose={() => setConfermaArchiviaFatte(false)}
        onConfirm={() => { void archiviaCompletate(); setConfermaArchiviaFatte(false); }}
        title="Archivia completate"
        description={`Vuoi archiviare ${completate} task completat${completate === 1 ? 'a' : 'e'}? Spariranno dalla bacheca ma restano nell'elenco con “Mostra archiviate”.`}
        confirmLabel="Archivia"
      />

      {/* Nuova task, dalla colonna di una persona o dagli urgenti. */}
      <Modal open={mostraNuova} onClose={() => setMostraNuova(false)} title="Nuova Task" size="lg">
        <TaskForm
          showClientSelect
          clients={clients}
          defaultAssignedTo={nuovaPerMembro}
          showAttachments
          showAiDescription
          onSubmit={creaTask}
          onCancel={() => setMostraNuova(false)}
        />
      </Modal>

      {/* Creazione con AI: si incolla cosa va fatto, l'AI propone le task. */}
      <Modal open={mostraAi} onClose={() => setMostraAi(false)} title="Crea Task con AI" size="lg">
        <div className="space-y-4">
          {!aiProposte ? (
            <>
              <div className="p-3 rounded-xl bg-pw-accent/10 text-pw-accent text-sm">
                Descrivi in linguaggio naturale cosa va fatto. L&apos;AI creerà i task e li assegnerà
                automaticamente al membro del team più adatto.
              </div>

              <Select
                id="ai-client"
                label="Cliente *"
                value={aiCliente}
                onChange={(e) => setAiCliente(e.target.value)}
                options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
                placeholder="Seleziona cliente"
              />

              <div>
                <label htmlFor="ai-testo" className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">
                  Cosa bisogna fare? *
                </label>
                <textarea
                  id="ai-testo"
                  value={aiTesto}
                  onChange={(e) => setAiTesto(e.target.value)}
                  placeholder="es. Dobbiamo creare 3 post Instagram per il lancio del nuovo prodotto, scrivere un articolo blog sulla sostenibilità e preparare la newsletter mensile per i clienti VIP…"
                  rows={5}
                  className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 ease-out text-sm resize-none"
                />
              </div>

              <Button onClick={analizzaConAi} loading={aiInCorso} disabled={!aiTesto.trim() || !aiCliente} className="w-full">
                <Brain size={16} />
                Analizza e Crea Task
              </Button>
            </>
          ) : aiSalvate ? (
            <div className="p-4 rounded-xl bg-green-500/10 text-green-400 text-center">
              <Check size={32} className="mx-auto mb-2" />
              <p className="font-semibold">Task salvati con successo!</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-pw-text">{aiProposte.length} task generati</p>
                <Button onClick={salvaProposteAi} loading={aiInCorso}>
                  <Check size={14} />
                  Salva tutti
                </Button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {aiProposte.map((t, i) => (
                  <div key={i} className="p-4 rounded-xl border border-pw-border bg-pw-surface-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-pw-text">{t.title}</h4>
                        <p className="text-sm text-pw-text-muted mt-1">{stripHtml(t.description)}</p>
                      </div>
                      <Badge className="bg-indigo-500/15 text-indigo-400 shrink-0">
                        {getRoleLabel(t.assigned_to_role)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-pw-text-muted">
                      <span>Priorità: {PRIORITY_LABELS[t.priority] || t.priority}</span>
                      {t.estimated_hours && <span>~{t.estimated_hours}h</span>}
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" onClick={() => { setAiProposte(null); setAiSalvate(false); }} className="w-full">
                Modifica la richiesta
              </Button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
