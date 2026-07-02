'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { TaskForm } from '@/components/tasks/task-form';
import { TaskViewSwitcher } from '@/components/tasks/view-switcher';
import { formatDate, getInitials, getStatusBarColor, safeStorageName } from '@/lib/utils';
import type { Task, Profile, Client } from '@/types/database';
import {
  LayoutGrid,
  Plus,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Paperclip,
  X,
  Loader2,
} from 'lucide-react';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';

export default function BachecaPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addToMemberId, setAddToMemberId] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);

  const isAdmin = profile?.role === 'admin';

  const fetchData = useCallback(async () => {
    const [tasksRes, membersRes, clientsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(`
          *,
          project:projects(id, name, color, client_id, client:clients(id, name, company)),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, color)
        `)
        .is('archived_at', null)
        .order('position')
        .limit(2000),
      supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('company'),
    ]);

    setTasks((tasksRes.data as Task[]) || []);
    setMembers((membersRes.data as Profile[]) || []);
    setClients((clientsRes.data as Client[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData().catch(() => setError(true));
  }, [fetchData]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const newAssigneeId = destination.droppableId === 'urgent' ? null : destination.droppableId;
    const newPriority = destination.droppableId === 'urgent' ? 'urgent' : undefined;

    const updates: Record<string, unknown> = {};
    if (destination.droppableId === 'urgent') {
      updates.priority = 'urgent';
    } else {
      updates.assigned_to = newAssigneeId;
      // Se era urgente e viene spostato a una persona, torna a priorità alta
      const task = tasks.find((t) => t.id === draggableId);
      if (task?.priority === 'urgent') {
        updates.priority = 'high';
      }
    }

    updates.position = destination.index;

    const { error } = await supabase.from('tasks').update(updates).eq('id', draggableId);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'bacheca', stage: 'drag_drop' } });
      toast.error('Errore nello spostamento della task');
    }
    // Refetch sempre: riallinea la UI allo stato reale del DB (anche in caso di errore
    // la card torna al suo posto originale)
    fetchData();
  };

  const getColumnTasks = (memberId: string): Task[] => {
    return tasks
      .filter((t) => t.assigned_to === memberId && t.priority !== 'urgent' && t.status !== 'done')
      .sort((a, b) => a.position - b.position);
  };

  const getColumnDoneTasks = (memberId: string): Task[] => {
    return tasks
      .filter((t) => t.assigned_to === memberId && t.priority !== 'urgent' && t.status === 'done')
      .sort((a, b) => a.position - b.position);
  };

  const getUrgentTasks = (): Task[] => {
    return tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').sort((a, b) => a.position - b.position);
  };

  const getUrgentDoneTasks = (): Task[] => {
    return tasks.filter((t) => t.priority === 'urgent' && t.status === 'done').sort((a, b) => a.position - b.position);
  };

  const handleArchiveCompleted = async () => {
    const doneTasks = tasks.filter((t) => t.status === 'done');
    if (doneTasks.length === 0) return;
    const ids = doneTasks.map((t) => t.id);
    await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).in('id', ids);
    fetchData();
  };

  const totalDone = tasks.filter((t) => t.status === 'done').length;

  const openAddTask = (memberId: string | null) => {
    setAddToMemberId(memberId);
    setAttachFiles([]);
    setShowAddTask(true);
  };

  const getClientName = (task: Task): string => {
    const project = task.project as { name: string; client?: { name: string; company: string | null } } | undefined;
    return project?.client?.company || project?.client?.name || project?.name || '';
  };

  const getProjectColor = (task: Task): string => {
    const project = task.project as { color: string } | undefined;
    return project?.color || '#FFD108';
  };

  const isOverdue = (task: Task): boolean => {
    if (!task.deadline) return false;
    return new Date(task.deadline) < new Date() && task.status !== 'done';
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonList variant="card" count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-pw-text-muted text-sm">Errore nel caricamento della bacheca.</p>
        <Button variant="outline" onClick={() => { setError(false); setLoading(true); fetchData().catch(() => setError(true)); }}>
          Riprova
        </Button>
      </div>
    );
  }

  const TaskCard = ({ task, index, isDone }: { task: Task; index: number; isDone?: boolean }) => {
    const cardContent = (
      <div
        onClick={() => setSelectedTask(task)}
        style={{ borderLeftWidth: 4, borderLeftColor: getStatusBarColor(task.status) }}
        className={`p-3 rounded-xl border transition-all duration-200 ease-out mb-2 cursor-pointer ${
          isDone
            ? 'border-green-500/20 bg-green-500/5 opacity-60'
            : 'border-pw-border bg-pw-surface-2 hover:border-pw-border-hover'
        }`}
      >
        {/* Client color bar */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-8 h-1 rounded-full" style={{ backgroundColor: getProjectColor(task) }} />
          {task.ai_generated && <Sparkles size={10} className="text-pw-accent" />}
          {isDone && <CheckCircle2 size={10} className="text-green-500" />}
        </div>

        {/* Task status check */}
        <div className="flex items-start gap-2">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (isDone) {
                // Ripristina
                await supabase.from('tasks').update({ status: 'todo' }).eq('id', task.id);
              } else {
                await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id);
              }
              fetchData();
            }}
            className={`mt-0.5 shrink-0 w-4 h-4 rounded border transition-colors duration-200 ease-out ${
              isDone
                ? 'border-green-500 bg-green-500 flex items-center justify-center'
                : 'border-pw-border hover:border-green-500'
            }`}
            title={isDone ? 'Ripristina' : 'Segna come completato'}
          >
            {isDone && <CheckCircle2 size={10} className="text-white" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`text-xs truncate uppercase font-medium ${isDone ? 'text-pw-text-dim' : 'text-pw-text-muted'}`}>
              {getClientName(task)}
            </p>
            <p className={`text-sm font-medium mt-0.5 leading-snug ${isDone ? 'text-pw-text-dim line-through' : 'text-pw-text'}`}>
              {task.title}
            </p>
          </div>
        </div>

        {/* Footer */}
        {!isDone && (
          <div className="flex items-center gap-2 mt-2">
            {task.deadline && (
              <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${
                isOverdue(task) ? 'bg-red-500/15 text-red-400' : 'bg-pw-surface-3 text-pw-text-muted'
              }`}>
                <Calendar size={10} />
                {formatDate(task.deadline)}
              </span>
            )}
            {task.priority === 'urgent' && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400">
                <AlertTriangle size={10} />
                Urgente
              </span>
            )}
          </div>
        )}
      </div>
    );

    if (isDone) return cardContent;

    return (
      <Draggable draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={snapshot.isDragging ? 'shadow-lg shadow-pw-accent/10' : ''}
          >
            {cardContent}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <PageHeader
        title="Bacheca"
        subtitle={`${tasks.filter(t => t.status !== 'done').length} attivi · ${totalDone} completati`}
        actions={
          totalDone > 0 && (
            <Button variant="outline" onClick={() => setConfirmArchive(true)}>
              <CheckCircle2 size={14} />
              Archivia {totalDone} completat{totalDone === 1 ? 'o' : 'i'}
            </Button>
          )
        }
      />

      <TaskViewSwitcher active="kanban" />

      {/* Legenda colori stato: la striscia a sinistra di ogni card ne indica lo stato */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-pw-text-muted">
        {[
          { status: 'todo', label: 'Da fare' },
          { status: 'in_progress', label: 'In corso' },
          { status: 'review', label: 'Review' },
          { status: 'done', label: 'Fatto' },
        ].map((s) => (
          <span key={s.status} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: getStatusBarColor(s.status) }} />
            {s.label}
          </span>
        ))}
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {/* Column per member */}
          {members.filter(m => m.role !== 'admin' || isAdmin).map((member) => {
            const columnTasks = getColumnTasks(member.id);
            return (
              <div key={member.id} className="w-72 shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: member.color || '#ff4d1c' }}>
                      <span className="text-white text-[9px] font-bold">{getInitials(member.full_name)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-pw-text uppercase tracking-wide">
                        {member.full_name.split(' ')[0]}
                      </p>
                      <p className="text-[10px] text-pw-text-dim">{columnTasks.length} task</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openAddTask(member.id)}
                    className="p-1 rounded-lg text-pw-text-dim hover:text-pw-accent hover:bg-pw-surface-2 transition-colors duration-200 ease-out"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Droppable column */}
                <Droppable droppableId={member.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[200px] p-2 rounded-xl border transition-colors duration-200 ease-out ${
                        snapshot.isDraggingOver
                          ? 'border-pw-accent/30 bg-pw-accent/5'
                          : 'border-pw-border bg-pw-surface/50'
                      }`}
                    >
                      {columnTasks.map((task, index) => (
                        <TaskCard key={task.id} task={task} index={index} />
                      ))}
                      {provided.placeholder}
                      {columnTasks.length === 0 && getColumnDoneTasks(member.id).length === 0 && (
                        <button
                          onClick={() => openAddTask(member.id)}
                          className="w-full py-3 text-xs text-pw-text-dim hover:text-pw-accent transition-colors duration-200 ease-out flex items-center justify-center gap-1"
                        >
                          <Plus size={14} />
                          Aggiungi una scheda
                        </button>
                      )}
                      {/* Completed tasks */}
                      {getColumnDoneTasks(member.id).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-pw-border">
                          {getColumnDoneTasks(member.id).map((task, index) => (
                            <TaskCard key={task.id} task={task} index={index} isDone />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}

          {/* URGENT column */}
          <div className="w-72 shrink-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-400 uppercase tracking-wide">Urgente</p>
                  <p className="text-[10px] text-pw-text-dim">{getUrgentTasks().length} task</p>
                </div>
              </div>
              <button
                onClick={() => openAddTask(null)}
                className="p-1 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2 transition-colors duration-200 ease-out"
              >
                <Plus size={16} />
              </button>
            </div>

            <Droppable droppableId="urgent">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-[200px] p-2 rounded-xl border transition-colors duration-200 ease-out ${
                    snapshot.isDraggingOver
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-pw-border bg-pw-surface/50'
                  }`}
                >
                  {getUrgentTasks().map((task, index) => (
                    <TaskCard key={task.id} task={task} index={index} />
                  ))}
                  {provided.placeholder}
                  {getUrgentTasks().length === 0 && getUrgentDoneTasks().length === 0 && (
                    <button
                      onClick={() => openAddTask(null)}
                      className="w-full py-3 text-xs text-pw-text-dim hover:text-red-400 transition-colors duration-200 ease-out flex items-center justify-center gap-1"
                    >
                      <Plus size={14} />
                      Aggiungi una scheda
                    </button>
                  )}
                  {getUrgentDoneTasks().length > 0 && (
                    <div className="mt-2 pt-2 border-t border-pw-border">
                      {getUrgentDoneTasks().map((task, index) => (
                        <TaskCard key={task.id} task={task} index={index} isDone />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>

      {/* Task detail modal */}
      <TaskDetailModal
        task={selectedTask}
        members={members}
        clients={clients}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={() => { setSelectedTask(null); fetchData(); }}
      />

      {/* Conferma archiviazione massiva dei completati */}
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => { handleArchiveCompleted(); setConfirmArchive(false); }}
        title="Archivia completati"
        description={`Vuoi archiviare ${totalDone} task completat${totalDone === 1 ? 'a' : 'e'}? Spariranno dalla bacheca ma resteranno consultabili filtrando per stato “Archiviato”.`}
        confirmLabel="Archivia"
      />

      {/* Add task modal — usa TaskForm universale */}
      <Modal
        open={showAddTask}
        onClose={() => setShowAddTask(false)}
        title="Nuova Task"
        size="lg"
      >
        <TaskForm
          showClientSelect
          clients={clients}
          defaultAssignedTo={addToMemberId}
          showAttachments
          showAiDescription
          onSubmit={async (data, files) => {
            if (!profile) return;
            setAddingTask(true);
            try {
              let projectId: string | null = null;
              if (data.client_id) {
                const { data: pid, error: rpcErr } = await supabase.rpc('get_or_create_client_project', {
                  p_client_id: data.client_id,
                  p_created_by: profile.id,
                });
                if (rpcErr) throw rpcErr;
                projectId = pid;
              }

              if (!projectId) {
                const { data: defaultProject, error: selErr } = await supabase
                  .from('projects')
                  .select('id')
                  .eq('name', 'Generale')
                  .maybeSingle();
                if (selErr) throw selErr;
                if (defaultProject) {
                  projectId = defaultProject.id;
                } else {
                  const { data: newProject, error: projErr } = await supabase
                    .from('projects')
                    .insert({ name: 'Generale', status: 'active', color: '#FFD108', created_by: profile.id })
                    .select()
                    .single();
                  if (projErr) throw projErr;
                  projectId = newProject?.id || null;
                }
              }

              if (!projectId) throw new Error('Impossibile determinare il progetto per la task');

              // status: in creazione il TaskForm non espone più il campo → sempre "todo"
              const { data: createdTask, error: taskErr } = await supabase.from('tasks').insert({
                title: data.title,
                description: data.description || null,
                project_id: projectId,
                assigned_to: data.assigned_to || addToMemberId,
                priority: data.priority,
                deadline: data.deadline || null,
                estimated_hours: data.estimated_hours ? Number(data.estimated_hours) : null,
                status: data.status || 'todo',
                position: 0,
                created_by: profile.id,
              }).select('id').single();
              if (taskErr) throw taskErr;

              if (createdTask && files && files.length > 0) {
                const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
                let attachFailed = 0;
                let lastErr = '';
                for (const file of files) {
                  if (file.size > MAX_FILE_SIZE) { attachFailed++; lastErr = `"${file.name}" supera i 10MB`; continue; }
                  // Sanifica il nome per la chiave storage (spazi/apostrofi/accenti la facevano fallire)
                  const path = `${createdTask.id}/${Date.now()}_${safeStorageName(file.name)}`;
                  const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
                  if (uploadError) { attachFailed++; lastErr = uploadError.message; console.error('[bacheca] upload allegato fallito:', file.name, uploadError); continue; }
                  const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
                  const { error: attErr } = await supabase.from('task_attachments').insert({
                    task_id: createdTask.id,
                    file_name: file.name,
                    file_url: urlData.publicUrl,
                    file_type: file.type,
                    file_size: file.size,
                    uploaded_by: profile.id,
                  });
                  if (attErr) { attachFailed++; lastErr = attErr.message; console.error('[bacheca] insert allegato fallito:', file.name, attErr); }
                }
                if (attachFailed > 0) toast.error(`${attachFailed} allegato/i non caricato/i${lastErr ? `: ${lastErr}` : ''}`);
              }

              toast.success('Task creata');
              setShowAddTask(false);
              setAttachFiles([]);
              fetchData();
            } catch (e) {
              // Prima l'errore veniva ingoiato: il modal si chiudeva senza dire nulla.
              const msg = (e as { message?: string } | undefined)?.message || '';
              const friendly = /row-level security|permission|policy|not authorized/i.test(msg)
                ? 'Non hai i permessi per creare questa task. Contatta un amministratore.'
                : (msg || 'Errore durante la creazione della task');
              toast.error(friendly);
            } finally {
              setAddingTask(false);
            }
          }}
          onCancel={() => setShowAddTask(false)}
        />
      </Modal>
    </div>
  );
}
