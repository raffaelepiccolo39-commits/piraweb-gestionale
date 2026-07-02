'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { SkeletonList } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { PRIORITY_LABELS } from '@/lib/constants';
import type { RecurringTask, Project, Profile } from '@/types/database';
import {
  RefreshCw,
  Plus,
  Pause,
  Play,
  Trash2,
  Calendar,
  Clock,
} from 'lucide-react';

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Giornaliera',
  weekly: 'Settimanale',
  biweekly: 'Bisettimanale',
  monthly: 'Mensile',
};

export default function RecurringTasksPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    title: '', description: '', project_id: '', assigned_to: '',
    priority: 'medium', estimated_hours: '', recurrence_type: 'weekly', recurrence_day: '',
  });

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('recurring_tasks')
      .select('*, project:projects(id, name), assignee:profiles!recurring_tasks_assigned_to_fkey(id, full_name, color)')
      .order('created_at', { ascending: false });
    setTasks((data as RecurringTask[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([
      fetchTasks(),
      supabase.from('projects').select('id, name').eq('status', 'active').order('name').then((r) => setProjects((r.data as Project[]) || [])),
      supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name').then((r) => setMembers((r.data as Profile[]) || [])),
    ]).finally(() => setLoading(false));
  }, [fetchTasks, supabase]);

  const handleCreate = async () => {
    if (!form.title || !form.project_id) { toast.error('Titolo e progetto obbligatori'); return; }

    // Calculate first next_due_at
    const now = new Date();
    let nextDue: Date;
    switch (form.recurrence_type) {
      case 'daily': nextDue = new Date(now.getTime() + 86400000); break;
      case 'weekly': nextDue = new Date(now.getTime() + 7 * 86400000); break;
      case 'biweekly': nextDue = new Date(now.getTime() + 14 * 86400000); break;
      case 'monthly': nextDue = new Date(now.setMonth(now.getMonth() + 1)); break;
      default: nextDue = new Date(now.getTime() + 7 * 86400000);
    }

    if (!profile) return;
    const { error } = await supabase.from('recurring_tasks').insert({
      title: form.title,
      description: form.description || null,
      project_id: form.project_id,
      assigned_to: form.assigned_to || null,
      priority: form.priority,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
      recurrence_type: form.recurrence_type,
      recurrence_day: form.recurrence_day ? parseInt(form.recurrence_day) : null,
      next_due_at: nextDue.toISOString(),
      created_by: profile.id,
    });

    if (!error) {
      toast.success('Task ricorrente creata');
      setShowForm(false);
      setForm({ title: '', description: '', project_id: '', assigned_to: '', priority: 'medium', estimated_hours: '', recurrence_type: 'weekly', recurrence_day: '' });
      fetchTasks();
    } else {
      toast.error('Errore nella creazione');
    }
  };

  const handleToggle = async (task: RecurringTask) => {
    try {
      const { error } = await supabase.from('recurring_tasks').update({ is_active: !task.is_active }).eq('id', task.id);
      if (error) throw error;
      toast.success(task.is_active ? 'Task ricorrente in pausa' : 'Task ricorrente attivato');
      fetchTasks();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('recurring_tasks').delete().eq('id', id);
      if (error) throw error;
      toast.success('Task ricorrente eliminato');
      fetchTasks();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'eliminazione');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonList variant="card" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Task Ricorrenti"
        subtitle="Task che si generano automaticamente su base periodica"
        actions={
          isAdmin && (
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} />
              Nuova Ricorrente
            </Button>
          )
        }
      />

      <DataTable
        data={tasks}
        rowKey={(t) => t.id}
        columns={[]}
        variant="card"
        searchKeys={[
          (t) => t.title,
          (t) => (t.project as Project | undefined)?.name || '',
          (t) => (t.assignee as Profile | undefined)?.full_name || '',
        ]}
        searchPlaceholder="Cerca per titolo, progetto o assegnatario…"
        filters={[
          {
            key: 'recurrence_type',
            label: 'Tutte le frequenze',
            options: Object.entries(RECURRENCE_LABELS).map(([v, l]) => ({ value: v, label: l })),
            accessor: (t) => t.recurrence_type,
          },
          {
            key: 'is_active',
            label: 'Tutti gli stati',
            options: [
              { value: 'active', label: 'Attive' },
              { value: 'paused', label: 'In pausa' },
            ],
            accessor: (t) => (t.is_active ? 'active' : 'paused'),
          },
        ]}
        cardRender={(task) => {
          const project = task.project as Project | undefined;
          const assignee = task.assignee as Profile | undefined;
          return (
            <Card className={!task.is_active ? 'opacity-50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-pw-text">{task.title}</h3>
                    <p className="text-[10px] text-pw-text-dim mt-0.5">
                      {project?.name} {assignee ? `· ${assignee.full_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleToggle(task)} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2" title={task.is_active ? 'Metti in pausa' : 'Riattiva'} aria-label={task.is_active ? 'Metti in pausa task ricorrente' : 'Riattiva task ricorrente'}>
                      {task.is_active ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    {isAdmin && (
                      <button onClick={() => setDeletingId(task.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2" aria-label="Elimina task ricorrente">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    <RefreshCw size={8} className="mr-1" />
                    {RECURRENCE_LABELS[task.recurrence_type]}
                  </Badge>
                  <Badge>{PRIORITY_LABELS[task.priority]}</Badge>
                  {task.is_active ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Attiva</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-700 dark:bg-pw-surface-2 dark:text-pw-text-muted">In pausa</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-pw-text-dim">
                  {task.next_due_at && (
                    <span className="flex items-center gap-1">
                      <Calendar size={9} />
                      Prossima: {formatDate(task.next_due_at)}
                    </span>
                  )}
                  {task.estimated_hours && (
                    <span className="flex items-center gap-1">
                      <Clock size={9} />
                      {task.estimated_hours}h stimate
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        }}
        emptyState={{
          icon: RefreshCw,
          title: 'Nessuna task ricorrente',
          description: 'Crea task che si rigenerano automaticamente ogni settimana o mese.',
          action: isAdmin ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus size={14} />
              Crea Task Ricorrente
            </Button>
          ) : undefined,
        }}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuova Task Ricorrente">
        <div className="space-y-4">
          <Input label="Titolo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Es: Report settimanale social" required />
          <Textarea label="Descrizione" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Progetto" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} options={projects.map((p) => ({ value: p.id, label: p.name }))} required />
            <Select label="Assegnato a" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} options={[{ value: '', label: 'Nessuno' }, ...members.map((m) => ({ value: m.id, label: m.full_name }))]} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Frequenza" value={form.recurrence_type} onChange={(e) => setForm({ ...form, recurrence_type: e.target.value })} options={Object.entries(RECURRENCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            <Select label="Priorita'" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            <Input label="Ore stimate" type="number" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button>
            <Button onClick={handleCreate}>Crea</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => (deletingId ? handleDelete(deletingId) : Promise.resolve())}
        title="Elimina task ricorrente"
        description="Sei sicuro di voler eliminare questa task ricorrente? L'azione non può essere annullata."
        confirmLabel="Elimina"
      />
    </div>
  );
}
