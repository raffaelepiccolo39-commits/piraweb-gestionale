'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { formatDate, getPriorityTone, getStatusTone } from '@/lib/utils';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import { SkeletonList } from '@/components/ui/skeleton';
import type { Task } from '@/types/database';
import { List, Calendar, AlertTriangle, Sparkles } from 'lucide-react';

const NO_SECTOR = '__none__';

export default function ElencoPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const fetchTasks = useCallback(async () => {
    if (!profile) return;
    try {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          project:projects(id, name, color, client:clients(id, name, company, sector)),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, color)
        `);

      if (assigneeFilter === 'me') {
        query = query.eq('assigned_to', profile.id);
      } else if (assigneeFilter && assigneeFilter !== 'all') {
        query = query.eq('assigned_to', assigneeFilter);
      }

      query = query.neq('status', 'archived').order('updated_at', { ascending: false }).limit(500);

      const { data, error } = await query;
      if (error) throw error;
      setTasks((data as Task[]) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, assigneeFilter]);

  const fetchTeamMembers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name');
    if (data) setTeamMembers(data);
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchTeamMembers();
  }, [fetchTasks, fetchTeamMembers]);

  const sectorOf = (t: Task) => {
    const client = (t.project as { client?: { sector?: string | null } } | undefined)?.client;
    return client?.sector?.trim() || NO_SECTOR;
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonList variant="row" count={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare le task. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchTasks(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Elenco"
        subtitle={`${tasks.length} task raggruppate per settore cliente`}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Tutti i Task' },
              { value: 'me', label: 'I miei Task' },
              ...teamMembers.filter(m => m.id !== profile?.id).map(m => ({ value: m.id, label: m.full_name })),
            ]}
          />
        </div>
      </div>

      <DataTable
        data={tasks}
        rowKey={(t) => t.id}
        columns={[]}
        variant="card"
        cardGridClassName="space-y-2"
        groupBy={sectorOf}
        groupLabel={(key) => (key === NO_SECTOR ? 'Senza settore' : key)}
        searchKeys={[
          (t) => t.title,
          (t) => t.description || '',
          (t) => (t.project as { name?: string } | undefined)?.name || '',
          (t) => (t.project as { client?: { company?: string; name?: string } } | undefined)?.client?.company || '',
        ]}
        searchPlaceholder="Cerca per titolo, progetto o cliente…"
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
        ]}
        emptyState={{
          icon: List,
          title: 'Nessuna task',
          description: 'Non ci sono task da mostrare con i filtri attuali.',
        }}
        cardRender={(task) => {
          const project = task.project as { id: string; name: string; color: string; client?: { company?: string; name?: string } } | undefined;
          const assignee = task.assignee as { full_name: string } | undefined;
          const clientName = project?.client?.company || project?.client?.name;
          return (
            <Link href={`/tasks/${task.id}`} className="block">
              <Card hover>
                <CardContent className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {project && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                        )}
                        <span className="text-xs text-pw-text-muted truncate">
                          {clientName || project?.name || 'Senza cliente'}
                        </span>
                        {task.ai_generated && <Sparkles size={10} className="text-pw-accent shrink-0" />}
                      </div>
                      <h3 className="font-medium text-pw-text truncate">{task.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.deadline && (
                        <span className="hidden sm:flex items-center gap-1 text-xs text-pw-text-muted">
                          <Calendar size={12} />
                          {formatDate(task.deadline)}
                        </span>
                      )}
                      {assignee && (
                        <span className="hidden md:inline text-xs text-pw-text-dim truncate max-w-[120px]">
                          {assignee.full_name}
                        </span>
                      )}
                      <Badge tone={getPriorityTone(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
                      <Badge tone={getStatusTone(task.status)} dot>{STATUS_LABELS[task.status]}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        }}
      />
    </div>
  );
}
