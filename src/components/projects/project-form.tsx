'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { Project, Client, Profile } from '@/types/database';

interface ProjectFormProps {
  project?: Project;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  onCancel: () => void;
}

export interface ProjectFormData {
  name: string;
  description: string;
  client_id: string;
  status: string;
  color: string;
  deadline: string;
  member_ids: string[];
}

const statusOptions = [
  { value: 'draft', label: 'Bozza' },
  { value: 'active', label: 'Attivo' },
  { value: 'paused', label: 'In pausa' },
  { value: 'completed', label: 'Completato' },
  { value: 'archived', label: 'Archiviato' },
];

const colorOptions = [
  '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

export function ProjectForm({ project, onSubmit, onCancel }: ProjectFormProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [form, setForm] = useState<ProjectFormData>({
    name: project?.name || '',
    description: project?.description || '',
    client_id: project?.client_id || '',
    status: project?.status || 'draft',
    color: project?.color || '#4F46E5',
    deadline: project?.deadline ? project.deadline.split('T')[0] : '',
    member_ids: project?.members?.map((m) => m.user_id) || [],
  });

  useEffect(() => {
    const fetchData = async () => {
      const [clientsRes, membersRes] = await Promise.all([
        supabase.from('clients').select('*').eq('is_active', true).order('name'),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ]);
      if (clientsRes.data) setClients(clientsRes.data as Client[]);
      if (membersRes.data) setTeamMembers(membersRes.data as Profile[]);
    };
    fetchData();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(form);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      member_ids: prev.member_ids.includes(userId)
        ? prev.member_ids.filter((id) => id !== userId)
        : [...prev.member_ids, userId],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id="project-name"
        label="Nome Progetto *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        placeholder="Nome del progetto"
      />

      <Textarea
        id="project-desc"
        label="Descrizione"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Descrizione del progetto..."
        rows={3}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          id="project-client"
          label="Cliente"
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Seleziona cliente"
        />
        <Select
          id="project-status"
          label="Stato"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={statusOptions}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          id="project-deadline"
          label="Scadenza"
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-pw-text-muted">
            Colore
          </label>
          <div className="flex gap-2">
            {colorOptions.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setForm({ ...form, color })}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  form.color === color
                    ? 'border-gray-900 dark:border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Team members */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-pw-text-muted">
          Membri del team
        </label>
        <div className="flex flex-wrap gap-2">
          {teamMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => toggleMember(member.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                form.member_ids.includes(member.id)
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 ring-2 ring-indigo-500'
                  : 'bg-pw-surface-3 text-pw-text-muted hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {member.full_name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" loading={loading}>
          {project ? 'Aggiorna' : 'Crea Progetto'}
        </Button>
      </div>
    </form>
  );
}
