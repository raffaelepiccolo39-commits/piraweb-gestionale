'use client';


import { useEffect, useState, useCallback, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { TaskForm, type TaskFormData } from '@/components/tasks/task-form';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { ProjectForm, type ProjectFormData } from '@/components/projects/project-form';
import { InstallmentsManager } from '@/components/clients/installments-manager';
import { formatDate, getStatusTone, getInitials } from '@/lib/utils';
import type { Project, Task, Profile, Client } from '@/types/database';
import {
  ArrowLeft,
  Plus,
  Settings,
  Calendar,
  Users,
  Trash2,
} from 'lucide-react';

const statusLabels: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  paused: 'In pausa',
  completed: 'Completato',
  archived: 'Archiviato',
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<{ tasks: number; entries: number; hours: number } | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [filterMember, setFilterMember] = useState('');

  const isAdmin = profile?.role === 'admin';

  const fetchProject = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select(`
        *,
        client:clients(id, name),
        members:project_members(
          id, user_id,
          profile:profiles(id, full_name, role, avatar_url, color)
        )
      `)
      .eq('id', id)
      .single();
    setProject(data as Project | null);
  }, [supabase, id]);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, avatar_url, color)
      `)
      .eq('project_id', id)
      .order('position');
    setTasks((data as Task[]) || []);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    fetchProject();
    fetchTasks();
  }, [fetchProject, fetchTasks]);

  const taskSubmittingRef = useRef(false);

  const handleCreateTask = async (data: TaskFormData) => {
    if (!profile || taskSubmittingRef.current) return;
    taskSubmittingRef.current = true;
    try {
      const maxPosition = tasks
        .filter((t) => t.status === data.status)
        .reduce((max, t) => Math.max(max, t.position), -1);

      const { error } = await supabase.from('tasks').insert({
        title: data.title,
        description: data.description || null,
        project_id: id,
        assigned_to: data.assigned_to || null,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline || null,
        estimated_hours: data.estimated_hours ? parseFloat(data.estimated_hours) : null,
        position: maxPosition + 1,
        created_by: profile.id,
      });
      if (error) throw error;
      toast.success('Task creato');
      setShowTaskForm(false);
      fetchTasks();
    } catch (e) {
      // Prima errori silenti: il modal restava aperto senza feedback → utente confuso
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante la creazione del task');
    } finally {
      taskSubmittingRef.current = false;
    }
  };

  const handleUpdateProject = async (data: ProjectFormData) => {
    // RPC atomica: update progetto + sync membri in una sola transazione
    // (migration 00067). Evita lo stato "progetto senza membri" se la
    // INSERT post-DELETE falliva nel pattern precedente.
    const { error } = await supabase.rpc('update_project_with_members', {
      p_project_id: id,
      p_name: data.name,
      p_description: data.description || null,
      p_client_id: data.client_id || null,
      p_status: data.status,
      p_color: data.color,
      p_deadline: data.deadline || null,
      p_member_ids: data.member_ids,
    });
    if (error) {
      toast.error(error.message || 'Errore durante l\'aggiornamento del progetto');
      return;
    }
    // budget_amount non è nella RPC esistente: update separato (non-critico)
    const { error: budgetErr } = await supabase
      .from('projects')
      .update({ budget_amount: data.budget_amount ? Number(data.budget_amount) : null })
      .eq('id', id);
    if (budgetErr) {
      toast.error('Progetto aggiornato ma budget non salvato: ' + budgetErr.message);
      return;
    }
    toast.success('Progetto aggiornato');
    setShowProjectEdit(false);
    fetchProject();
  };

  const openDeleteConfirm = async () => {
    setShowDeleteConfirm(true);
    setDeleteImpact(null);
    // Misura l'impatto reale prima di lasciar premere "Elimina"
    try {
      const taskIds = tasks.map(t => t.id);
      let entries = 0;
      let totalMinutes = 0;
      if (taskIds.length > 0) {
        const { data } = await supabase
          .from('time_entries')
          .select('duration_minutes')
          .in('task_id', taskIds);
        entries = data?.length || 0;
        totalMinutes = (data || []).reduce((s, e) => s + Number(e.duration_minutes || 0), 0);
      }
      setDeleteImpact({ tasks: tasks.length, entries, hours: totalMinutes / 60 });
    } catch {
      // Se il fetch fallisce, mostriamo comunque il modal con i soli task da state
      setDeleteImpact({ tasks: tasks.length, entries: 0, hours: 0 });
    }
  };

  const handleDeleteProject = async () => {
    if (deletingProject) return;
    setDeletingProject(true);
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      toast.success('Progetto eliminato');
      router.push('/projects');
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'eliminazione');
      setDeletingProject(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-pw-text-dim">Progetto non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/projects')}>
          Torna ai progetti
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Breadcrumb items={[{ label: 'Progetti', href: '/projects' }, { label: project.name }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/projects')}
            className="p-2 rounded-lg hover:bg-pw-surface-2 transition-colors duration-200 ease-out"
          >
            <ArrowLeft size={20} className="text-pw-text-dim" />
          </button>
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-10 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <div>
              <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
                {project.name}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <Badge tone={getStatusTone(project.status)} dot>
                  {statusLabels[project.status]}
                </Badge>
                {project.deadline && (
                  <span className="flex items-center gap-1 text-sm text-pw-text-muted">
                    <Calendar size={14} />
                    {formatDate(project.deadline)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowProjectEdit(true)}>
                <Settings size={16} />
                Modifica
              </Button>
              <Button variant="outline" size="sm" onClick={openDeleteConfirm} className="text-red-600 hover:text-red-700">
                <Trash2 size={16} />
              </Button>
            </>
          )}
          {(isAdmin || tasks.some((t) => t.assigned_to === profile?.id)) && (
            <Button onClick={() => setShowTaskForm(true)}>
              <Plus size={18} />
              Nuovo Task
            </Button>
          )}
        </div>
      </div>

      {/* Team members */}
      {project.members && project.members.length > 0 && (
        <div className="flex items-center gap-2">
          <Users size={16} className="text-pw-text-dim" />
          <div className="flex -space-x-2">
            {project.members.map((member) => {
              const memberProfile = member.profile as { full_name: string; role: string } | undefined;
              return (
                <div
                  key={member.id}
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-white dark:border-pw-surface"
                  style={{ backgroundColor: (member.profile as { color?: string })?.color || '#ff4d1c' }}
                  title={memberProfile?.full_name || 'Membro'}
                >
                  <span className="text-white text-[10px] font-semibold">
                    {memberProfile ? getInitials(memberProfile.full_name) : '?'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter by assignee */}
      {(() => {
        const assignees = new Map<string, string>();
        for (const t of tasks) {
          if (t.assigned_to && t.assignee) {
            const a = t.assignee as { id: string; full_name: string };
            assignees.set(a.id, a.full_name);
          }
        }
        if (assignees.size <= 1) return null;
        return (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterMember('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ease-out ${
                !filterMember ? 'bg-pw-accent text-[#0A263A]' : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
              }`}
            >
              Tutti
            </button>
            {Array.from(assignees).map(([id, name]) => (
              <button
                key={id}
                onClick={() => setFilterMember(filterMember === id ? '' : id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ease-out ${
                  filterMember === id ? 'bg-pw-accent text-[#0A263A]' : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Kanban Board */}
      <KanbanBoard
        tasks={filterMember ? tasks.filter((t) => t.assigned_to === filterMember) : tasks}
        onTaskClick={(task) => setEditingTask(task)}
        onTasksUpdate={fetchTasks}
      />

      {/* Pagamenti del progetto (acconti + saldo) — solo admin gestisce */}
      {project.client_id && (
        <div className="pt-2">
          <InstallmentsManager
            clientId={project.client_id}
            projectId={id}
            projectBudget={project.budget_amount}
          />
        </div>
      )}

      {/* Create task modal */}
      <Modal open={showTaskForm} onClose={() => setShowTaskForm(false)} title="Nuovo Task" size="lg">
        <TaskForm
          projectId={id}
          onSubmit={handleCreateTask}
          onCancel={() => setShowTaskForm(false)}
        />
      </Modal>

      {/* Task detail pop-up (unico, condiviso con Bacheca e "Le mie task") */}
      <TaskDetailModal
        task={editingTask}
        members={(project.members?.map((m) => m.profile).filter(Boolean) as Profile[]) || []}
        clients={[] as Client[]}
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        onUpdate={() => { setEditingTask(null); fetchTasks(); }}
      />

      {/* Edit project modal */}
      <Modal
        open={showProjectEdit}
        onClose={() => setShowProjectEdit(false)}
        title="Modifica Progetto"
        size="lg"
      >
        <ProjectForm
          project={project}
          onSubmit={handleUpdateProject}
          onCancel={() => setShowProjectEdit(false)}
        />
      </Modal>

      {/* Delete project confirmation */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => { if (!deletingProject) { setShowDeleteConfirm(false); setDeleteImpact(null); } }}
        title="Elimina progetto"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            <p className="font-semibold mb-1">Operazione irreversibile</p>
            <p className="text-red-400">
              Eliminando &quot;{project.name}&quot; verranno cancellati a cascata anche tutti i suoi task e le ore registrate. I dati non sono recuperabili.
            </p>
          </div>
          {deleteImpact ? (
            <ul className="text-sm text-pw-text-muted space-y-1">
              <li>• <strong className="text-pw-text">{deleteImpact.tasks}</strong> task</li>
              <li>• <strong className="text-pw-text">{deleteImpact.entries}</strong> sessioni di lavoro registrate ({deleteImpact.hours.toFixed(1)} ore totali)</li>
            </ul>
          ) : (
            <p className="text-sm text-pw-text-dim">Calcolo impatto…</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteImpact(null); }} disabled={deletingProject}>
              Annulla
            </Button>
            <Button variant="danger" onClick={handleDeleteProject} loading={deletingProject}>
              Elimina definitivamente
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
