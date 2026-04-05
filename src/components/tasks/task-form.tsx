'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { Profile } from '@/types/database';

interface TaskFormProps {
  projectId: string;
  task?: {
    id: string;
    title: string;
    description: string | null;
    assigned_to: string | null;
    priority: string;
    status: string;
    deadline: string | null;
    estimated_hours: number | null;
  };
  onSubmit: (data: TaskFormData) => Promise<void>;
  onCancel: () => void;
}

export interface TaskFormData {
  title: string;
  description: string;
  assigned_to: string;
  priority: string;
  status: string;
  deadline: string;
  estimated_hours: string;
}

const priorityOptions = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const statusOptions = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Da fare' },
  { value: 'in_progress', label: 'In corso' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Fatto' },
];

export function TaskForm({ projectId, task, onSubmit, onCancel }: TaskFormProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [form, setForm] = useState<TaskFormData>({
    title: task?.title || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to || '',
    priority: task?.priority || 'medium',
    status: task?.status || 'todo',
    deadline: task?.deadline ? task.deadline.split('T')[0] : '',
    estimated_hours: task?.estimated_hours?.toString() || '',
  });

  useEffect(() => {
    const fetchMembers = async () => {
      // Get project members
      const { data: projectMembers } = await supabase
        .from('project_members')
        .select('user_id, profile:profiles(id, full_name, role)')
        .eq('project_id', projectId);

      if (projectMembers) {
        const profiles = projectMembers
          .map((pm: Record<string, unknown>) => pm.profile as Profile)
          .filter(Boolean);
        setMembers(profiles);
      }

      // If no project members, get all active profiles
      if (!projectMembers || projectMembers.length === 0) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('is_active', true)
          .order('full_name');
        if (data) setMembers(data as Profile[]);
      }
    };
    fetchMembers();
  }, [supabase, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="task-title"
        label="Titolo *"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
        placeholder="Titolo del task"
      />

      <Textarea
        id="task-desc"
        label="Descrizione"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Descrizione del task..."
        rows={3}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          id="task-assignee"
          label="Assegna a"
          value={form.assigned_to}
          onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
          options={members.map((m) => ({ value: m.id, label: m.full_name }))}
          placeholder="Non assegnato"
        />
        <Select
          id="task-priority"
          label="Priorità"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          options={priorityOptions}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          id="task-status"
          label="Stato"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={statusOptions}
        />
        <Input
          id="task-deadline"
          label="Scadenza"
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />
      </div>

      <Input
        id="task-hours"
        label="Ore stimate"
        type="number"
        step="0.5"
        min="0"
        value={form.estimated_hours}
        onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
        placeholder="es. 4"
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" loading={loading}>
          {task ? 'Aggiorna' : 'Crea Task'}
        </Button>
      </div>
    </form>
  );
}
