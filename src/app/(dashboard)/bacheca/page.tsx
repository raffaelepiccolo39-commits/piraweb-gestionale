'use client';


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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { TaskDetailModal } from '@/components/bacheca/task-detail-modal';
import { formatDate, getPriorityColor, getInitials } from '@/lib/utils';
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

const priorityLabels: Record<string, string> = {
  low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente',
};

const statusLabels: Record<string, string> = {
  backlog: 'Backlog', todo: 'Da fare', in_progress: 'In corso', review: 'Review', done: 'Fatto',
};

export default function BachecaPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addToMemberId, setAddToMemberId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', client_id: '', priority: 'medium', deadline: '' });
  const [addingTask, setAddingTask] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
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
        .not('status', 'eq', 'archived')
        .order('position'),
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
    fetchData();
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

    await supabase.from('tasks').update(updates).eq('id', draggableId);
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
    await supabase.from('tasks').update({ status: 'archived' as never }).in('id', ids);
    fetchData();
  };

  const totalDone = tasks.filter((t) => t.status === 'done').length;

  const openAddTask = (memberId: string | null) => {
    setAddToMemberId(memberId);
    setNewTask({ title: '', description: '', client_id: '', priority: memberId ? 'medium' : 'urgent', deadline: '' });
    setAttachFiles([]);
    setShowAddTask(true);
  };

  const handleAiDescription = async () => {
    if (!newTask.title.trim()) return;
    setGeneratingAi(true);
    try {
      const clientName = newTask.client_id
        ? clients.find((c) => c.id === newTask.client_id)?.company || clients.find((c) => c.id === newTask.client_id)?.name || ''
        : '';
      const res = await fetch('/api/ai/describe-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTask.title, client_name: clientName }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setNewTask((prev) => ({ ...prev, description: data.description }));
      }
    } catch { /* ignore */ }
    setGeneratingAi(false);
  };

  const handleAddTask = async () => {
    if (!profile || !newTask.title.trim()) return;
    setAddingTask(true);

    let projectId: string | null = null;
    if (newTask.client_id) {
      const { data } = await supabase.rpc('get_or_create_client_project', {
        p_client_id: newTask.client_id,
        p_created_by: profile.id,
      });
      projectId = data;
    }

    if (!projectId) {
      // Crea un progetto generico se non c'è cliente
      const { data: defaultProject } = await supabase
        .from('projects')
        .select('id')
        .eq('name', 'Generale')
        .maybeSingle();

      if (defaultProject) {
        projectId = defaultProject.id;
      } else {
        const { data: newProject } = await supabase
          .from('projects')
          .insert({ name: 'Generale', status: 'active', color: '#c8f55a', created_by: profile.id })
          .select()
          .single();
        projectId = newProject?.id || null;
      }
    }

    if (projectId) {
      const { data: createdTask } = await supabase.from('tasks').insert({
        title: newTask.title,
        description: newTask.description || null,
        project_id: projectId,
        assigned_to: addToMemberId,
        priority: newTask.priority,
        deadline: newTask.deadline || null,
        status: 'todo',
        position: 0,
        created_by: profile.id,
      }).select('id').single();

      // Upload attachments
      if (createdTask && attachFiles.length > 0) {
        for (const file of attachFiles) {
          const ext = file.name.split('.').pop();
          const path = `${createdTask.id}/${Date.now()}_${file.name}`;
          const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
            await supabase.from('task_attachments').insert({
              task_id: createdTask.id,
              file_name: file.name,
              file_url: urlData.publicUrl,
              file_type: file.type,
              file_size: file.size,
              uploaded_by: profile.id,
            });
          }
        }
      }
    }

    setShowAddTask(false);
    setAddingTask(false);
    setAttachFiles([]);
    fetchData();
  };

  const getClientName = (task: Task): string => {
    const project = task.project as { name: string; client?: { name: string; company: string | null } } | undefined;
    return project?.client?.company || project?.client?.name || project?.name || '';
  };

  const getProjectColor = (task: Task): string => {
    const project = task.project as { color: string } | undefined;
    return project?.color || '#c8f55a';
  };

  const isOverdue = (task: Task): boolean => {
    if (!task.deadline) return false;
    return new Date(task.deadline) < new Date() && task.status !== 'done';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TaskCard = ({ task, index, isDone }: { task: Task; index: number; isDone?: boolean }) => {
    const cardContent = (
      <div
        onClick={() => setSelectedTask(task)}
        className={`p-3 rounded-xl border transition-all mb-2 cursor-pointer ${
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
            className={`mt-0.5 shrink-0 w-4 h-4 rounded border transition-colors ${
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Bacheca
          </h1>
          <p className="text-sm text-pw-text-muted">
            {tasks.filter(t => t.status !== 'done').length} attivi · {totalDone} completati
          </p>
        </div>
        {totalDone > 0 && (
          <Button variant="outline" onClick={handleArchiveCompleted}>
            <CheckCircle2 size={14} />
            Archivia {totalDone} completat{totalDone === 1 ? 'o' : 'i'}
          </Button>
        )}
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
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: member.color || '#8c7af5' }}>
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
                    className="p-1 rounded-lg text-pw-text-dim hover:text-pw-accent hover:bg-pw-surface-2 transition-colors"
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
                      className={`min-h-[200px] p-2 rounded-xl border transition-colors ${
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
                          className="w-full py-3 text-xs text-pw-text-dim hover:text-pw-accent transition-colors flex items-center justify-center gap-1"
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
                className="p-1 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>

            <Droppable droppableId="urgent">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-[200px] p-2 rounded-xl border transition-colors ${
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
                      className="w-full py-3 text-xs text-pw-text-dim hover:text-red-400 transition-colors flex items-center justify-center gap-1"
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

      {/* Add task modal */}
      <Modal
        open={showAddTask}
        onClose={() => setShowAddTask(false)}
        title="Aggiungi Scheda"
      >
        <div className="space-y-4">
          <Input
            id="task-title"
            label="Titolo *"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            placeholder="es. CLIENTE - cosa fare"
          />
          <Select
            id="task-client"
            label="Cliente"
            value={newTask.client_id}
            onChange={(e) => setNewTask({ ...newTask, client_id: e.target.value })}
            options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
            placeholder="Seleziona cliente"
          />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted">
                Descrizione
              </label>
              <button
                type="button"
                onClick={handleAiDescription}
                disabled={generatingAi || !newTask.title.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-pw-accent/15 text-pw-accent hover:bg-pw-accent/25 disabled:opacity-40 transition-colors"
              >
                {generatingAi ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {generatingAi ? 'Generando...' : 'Scrivi con AI'}
              </button>
            </div>
            <Textarea
              id="task-desc"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              placeholder="Dettagli del task..."
              rows={3}
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">
              Allegati
            </label>
            <label
              htmlFor="task-files"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-pw-border hover:border-pw-accent/50 cursor-pointer transition-colors text-sm text-pw-text-muted"
            >
              <Paperclip size={16} />
              Carica documenti...
              <input
                id="task-files"
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setAttachFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
            </label>
            {attachFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-pw-surface-3 text-xs text-pw-text-muted">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 ml-2 text-pw-text-dim hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              id="task-priority"
              label="Priorità"
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
              options={[
                { value: 'low', label: 'Bassa' },
                { value: 'medium', label: 'Media' },
                { value: 'high', label: 'Alta' },
                { value: 'urgent', label: 'Urgente' },
              ]}
            />
            <Input
              id="task-deadline"
              label="Scadenza"
              type="date"
              value={newTask.deadline}
              onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowAddTask(false)} className="flex-1">
              Annulla
            </Button>
            <Button onClick={handleAddTask} loading={addingTask} disabled={!newTask.title.trim()} className="flex-1">
              <Plus size={14} />
              Aggiungi
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
