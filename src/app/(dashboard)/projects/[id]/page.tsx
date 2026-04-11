'use client';


import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { TaskForm, type TaskFormData } from '@/components/tasks/task-form';
import { ProjectForm, type ProjectFormData } from '@/components/projects/project-form';
import { formatDate, getStatusColor, getInitials, getRoleLabel } from '@/lib/utils';
import type { Project, Task } from '@/types/database';
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
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const handleCreateTask = async (data: TaskFormData) => {
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
      created_by: profile!.id,
    });

    if (!error) {
      setShowTaskForm(false);
      fetchTasks();
    }
  };

  const handleUpdateTask = async (data: TaskFormData) => {
    if (!editingTask) return;
    const { error } = await supabase
      .from('tasks')
      .update({
        title: data.title,
        description: data.description || null,
        assigned_to: data.assigned_to || null,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline || null,
        estimated_hours: data.estimated_hours ? parseFloat(data.estimated_hours) : null,
      })
      .eq('id', editingTask.id);

    if (!error) {
      setEditingTask(null);
      fetchTasks();
    }
  };

  const handleUpdateProject = async (data: ProjectFormData) => {
    const { error } = await supabase
      .from('projects')
      .update({
        name: data.name,
        description: data.description || null,
        client_id: data.client_id || null,
        status: data.status,
        color: data.color,
        deadline: data.deadline || null,
      })
      .eq('id', id);

    if (error) return;

    // Update members
    await supabase.from('project_members').delete().eq('project_id', id);
    if (data.member_ids.length > 0) {
      await supabase.from('project_members').insert(
        data.member_ids.map((user_id) => ({ project_id: id, user_id }))
      );
    }

    setShowProjectEdit(false);
    fetchProject();
  };

  const handleDeleteProject = async () => {
    await supabase.from('projects').delete().eq('id', id);
    router.push('/projects');
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
        <p className="text-gray-500">Progetto non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/projects')}>
          Torna ai progetti
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Progetti', href: '/projects' }, { label: project.name }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/projects')}
            className="p-2 rounded-lg hover:bg-pw-surface-2 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-500" />
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
                <Badge className={getStatusColor(project.status)}>
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
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)} className="text-red-600 hover:text-red-700">
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
          <Users size={16} className="text-gray-400" />
          <div className="flex -space-x-2">
            {project.members.map((member) => {
              const memberProfile = member.profile as { full_name: string; role: string } | undefined;
              return (
                <div
                  key={member.id}
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900"
                  style={{ backgroundColor: (member.profile as { color?: string })?.color || '#8c7af5' }}
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !filterMember ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
              }`}
            >
              Tutti
            </button>
            {Array.from(assignees).map(([id, name]) => (
              <button
                key={id}
                onClick={() => setFilterMember(filterMember === id ? '' : id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterMember === id ? 'bg-pw-accent text-pw-bg' : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
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

      {/* Create task modal */}
      <Modal open={showTaskForm} onClose={() => setShowTaskForm(false)} title="Nuovo Task" size="lg">
        <TaskForm
          projectId={id}
          onSubmit={handleCreateTask}
          onCancel={() => setShowTaskForm(false)}
        />
      </Modal>

      {/* Edit task modal */}
      <Modal
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        title="Modifica Task"
        size="lg"
      >
        {editingTask && (
          <TaskForm
            projectId={id}
            task={editingTask}
            onSubmit={handleUpdateTask}
            onCancel={() => setEditingTask(null)}
          />
        )}
      </Modal>

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
        onClose={() => setShowDeleteConfirm(false)}
        title="Elimina Progetto"
        size="sm"
      >
        <p className="text-pw-text-muted mb-6">
          Sei sicuro di voler eliminare questo progetto e tutti i suoi task?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
            Annulla
          </Button>
          <Button variant="danger" onClick={handleDeleteProject}>
            Elimina
          </Button>
        </div>
      </Modal>
    </div>
  );
}
