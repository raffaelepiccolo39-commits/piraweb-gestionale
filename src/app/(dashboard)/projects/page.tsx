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
import type { Project } from '@/types/database';
import { Plus, FolderKanban, Calendar, Users, ArrowRight } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select(`
        *,
        client:clients(id, name),
        members:project_members(
          id, user_id,
          profile:profiles(id, full_name, role, avatar_url)
        )
      `)
      .order('created_at', { ascending: false });
    setProjects((data as Project[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (data: ProjectFormData) => {
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

    if (error || !project) return;

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
    fetchProjects();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Progetti
          </h1>
          <p className="text-sm text-pw-text-muted">
            {projects.length} progetti
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm(true)}>
            <Plus size={18} />
            Nuovo Progetto
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
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
                      <h3 className="font-semibold text-pw-text group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
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
                    {project.members && project.members.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {project.members.length}
                      </span>
                    )}
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-gray-400 group-hover:text-indigo-500 transition-colors"
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
