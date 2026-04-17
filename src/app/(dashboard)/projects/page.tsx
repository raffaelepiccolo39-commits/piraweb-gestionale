'use client';


import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectForm, type ProjectFormData } from '@/components/projects/project-form';
import { formatDate, getStatusColor } from '@/lib/utils';
import type { Project, Profile } from '@/types/database';
import { useToast } from '@/components/ui/toast';
import { Plus, FolderKanban, Calendar, Users, ArrowRight, AlertTriangle, Filter } from 'lucide-react';

const statusLabels: Record<string, string> = {
  draft: 'Bozza',
  active: 'Attivo',
  paused: 'In pausa',
  completed: 'Completato',
  archived: 'Archiviato',
};

export default function ProjectsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [filterMember, setFilterMember] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const toast = useToast();

  const fetchProjects = useCallback(async () => {
    try {
      const [projectsRes, membersRes] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            *,
            client:clients(id, name),
            members:project_members(
              id, user_id,
              profile:profiles(id, full_name, role, avatar_url)
            ),
            tasks(assigned_to)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name'),
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (membersRes.data) setMembers(membersRes.data as Profile[]);
      // Merge task assignees into members count + keep task assignee list
      const projects = ((projectsRes.data || []) as Array<Project & { tasks?: Array<{ assigned_to: string | null }> }>).map((p) => {
        const memberIds = new Set((p.members || []).map((m) => m.user_id));
        const taskAssignees = new Set<string>();
        if (p.tasks) {
          for (const t of p.tasks) {
            if (t.assigned_to) {
              memberIds.add(t.assigned_to);
              taskAssignees.add(t.assigned_to);
            }
          }
        }
        return { ...p, _teamCount: memberIds.size, _taskAssignees: Array.from(taskAssignees) };
      });
      setProjects(projects as Project[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (data: ProjectFormData) => {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name: data.name,
          description: data.description || null,
          client_id: data.client_id || null,
          status: data.status,
          color: data.color,
          deadline: data.deadline || null,
          created_by: profile!.id,
        })
        .select()
        .single();

      if (error || !project) throw error || new Error('Creazione fallita');

      // Add members
      if (data.member_ids.length > 0) {
        await supabase.from('project_members').insert(
          data.member_ids.map((user_id) => ({
            project_id: project.id,
            user_id,
          }))
        );
      }

      setShowForm(false);
      toast.success('Progetto creato con successo');
      fetchProjects();
    } catch {
      toast.error('Errore durante la creazione del progetto');
    }
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
        <button onClick={() => { setLoading(true); setError(false); fetchProjects(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  type ProjectExt = Project & { _taskAssignees?: string[] };
  const filteredProjects = filterMember
    ? projects.filter((p) => (p as ProjectExt)._taskAssignees?.includes(filterMember))
    : projects;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Progetti
          </h1>
          <p className="text-sm text-pw-text-muted">
            {filteredProjects.length} progett{filteredProjects.length === 1 ? 'o' : 'i'}
            {filterMember && ` per ${members.find((m) => m.id === filterMember)?.full_name}`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm(true)}>
            <Plus size={18} />
            Nuovo Progetto
          </Button>
        )}
      </div>

      {/* Filter by member */}
      {members.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterMember('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ease-out ${
              !filterMember
                ? 'bg-pw-accent text-[#0A263A]'
                : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
            }`}
          >
            Tutti
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setFilterMember(filterMember === m.id ? '' : m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 ease-out ${
                filterMember === m.id
                  ? 'bg-pw-accent text-[#0A263A]'
                  : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
              }`}
            >
              {m.full_name}
            </button>
          ))}
        </div>
      )}

      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nessun progetto"
          description="Crea il tuo primo progetto per iniziare"
          action={
            isAdmin ? (
              <Button onClick={() => setShowForm(true)}>
                <Plus size={18} />
                Nuovo Progetto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-10 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <div>
                      <h3 className="font-semibold text-pw-text group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200 ease-out">
                        {project.name}
                      </h3>
                      {project.client && (
                        <p className="text-sm text-pw-text-muted">
                          {(project.client as { name: string }).name}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={getStatusColor(project.status)}>
                    {statusLabels[project.status]}
                  </Badge>
                </div>

                {project.description && (
                  <p className="text-sm text-pw-text-muted line-clamp-2 mb-3">
                    {project.description}
                  </p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-pw-border">
                  <div className="flex items-center gap-3 text-xs text-pw-text-muted">
                    {project.deadline && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(project.deadline)}
                      </span>
                    )}
                    {((project as Project & { _teamCount?: number })._teamCount || project.members?.length || 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {(project as Project & { _teamCount?: number })._teamCount || project.members?.length || 0}
                      </span>
                    )}
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-pw-text-dim group-hover:text-indigo-500 transition-colors duration-200 ease-out"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nuovo Progetto"
        size="lg"
      >
        <ProjectForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}
