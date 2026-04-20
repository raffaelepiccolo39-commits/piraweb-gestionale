'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { Profile, Client } from '@/types/database';
import { Sparkles, Loader2, Paperclip, X } from 'lucide-react';

interface TaskFormProps {
  /** Se fornito, carica solo i membri del progetto */
  projectId?: string;
  /** Se fornito, mostra il selettore cliente */
  showClientSelect?: boolean;
  /** Lista clienti (se showClientSelect è true) */
  clients?: Client[];
  /** Se fornito, è in modalità modifica */
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
  /** Mostra il campo file allegati */
  showAttachments?: boolean;
  /** Mostra il bottone AI per generare descrizione */
  showAiDescription?: boolean;
  /** Callback invio form */
  onSubmit: (data: TaskFormData, files?: File[]) => Promise<void>;
  /** Callback annullamento */
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
  client_id?: string;
}

const priorityOptions = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const statusOptions = [
  { value: 'todo', label: 'Da fare' },
  { value: 'in_progress', label: 'In corso' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Fatto' },
];

export function TaskForm({
  projectId,
  showClientSelect = false,
  clients = [],
  task,
  showAttachments = false,
  showAiDescription = false,
  onSubmit,
  onCancel,
}: TaskFormProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState<TaskFormData>({
    title: task?.title || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to || '',
    priority: task?.priority || 'medium',
    status: task?.status || 'todo',
    deadline: task?.deadline ? task.deadline.split('T')[0] : '',
    estimated_hours: task?.estimated_hours?.toString() || '',
    client_id: '',
  });

  useEffect(() => {
    const fetchMembers = async () => {
      if (projectId) {
        const { data: projectMembers } = await supabase
          .from('project_members')
          .select('user_id, profile:profiles(id, full_name, role)')
          .eq('project_id', projectId);

        if (projectMembers && projectMembers.length > 0) {
          const profiles = projectMembers
            .map((pm: Record<string, unknown>) => pm.profile as Profile)
            .filter(Boolean);
          setMembers(profiles);
          return;
        }
      }

      // Fallback: tutti i membri attivi
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name');
      if (data) setMembers(data as Profile[]);
    };
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleAiDescription = async () => {
    if (!form.title.trim()) return;
    setGeneratingAi(true);
    try {
      const clientName = form.client_id
        ? clients.find((c) => c.id === form.client_id)?.company || clients.find((c) => c.id === form.client_id)?.name || ''
        : '';
      const res = await fetch('/api/ai/describe-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, client_name: clientName }),
      });
      const data = await res.json();
      if (res.ok && data.description) {
        setForm((prev) => ({ ...prev, description: data.description }));
      } else {
        setAiError(true); setTimeout(() => setAiError(false), 3000);
      }
    } catch { setAiError(true); setTimeout(() => setAiError(false), 3000); }
    setGeneratingAi(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await onSubmit(form, files.length > 0 ? files : undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Cliente (opzionale) */}
      {showClientSelect && clients.length > 0 && (
        <Select
          label="Cliente"
          value={form.client_id || ''}
          onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
          placeholder="Seleziona cliente (opzionale)"
        />
      )}

      {/* Titolo */}
      <Input
        label="Titolo *"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        required
        placeholder="Titolo del task"
      />

      {/* Descrizione + AI */}
      <div>
        <Textarea
          label="Descrizione"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Descrizione del task..."
          rows={3}
        />
        {showAiDescription && (
          <div className="mt-2 flex items-center">
            <button
              type="button"
              onClick={handleAiDescription}
              disabled={generatingAi || !form.title.trim()}
              className="flex items-center gap-1.5 text-[11px] text-pw-accent hover:text-pw-accent-hover transition-colors duration-200 disabled:opacity-40"
            >
              {generatingAi ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generatingAi ? 'Generazione...' : 'Genera con AI'}
            </button>
            {aiError && <span className="text-[11px] text-red-400 ml-2">Errore, riprova</span>}
          </div>
        )}
      </div>

      {/* Assegna + Priorità */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Assegna a"
          value={form.assigned_to}
          onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
          options={members.map((m) => ({ value: m.id, label: m.full_name }))}
          placeholder="Non assegnato"
        />
        <Select
          label="Priorità"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          options={priorityOptions}
        />
      </div>

      {/* Stato + Scadenza */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Stato"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          options={statusOptions}
        />
        <Input
          label="Scadenza"
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />
      </div>

      {/* Ore stimate */}
      <Input
        label="Ore stimate"
        type="number"
        step="0.5"
        min="0"
        value={form.estimated_hours}
        onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
        placeholder="es. 4"
      />

      {/* Allegati (opzionale) */}
      {showAttachments && (
        <div>
          <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
            Allegati
          </label>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-pw-surface-2 px-2.5 py-1.5 rounded-lg text-xs text-pw-text">
                <Paperclip size={12} className="text-pw-text-dim" />
                <span className="truncate max-w-[120px]">{f.name}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-pw-text-dim hover:text-red-400">
                  <X size={12} />
                </button>
              </div>
            ))}
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-pw-border text-xs text-pw-text-muted hover:border-pw-accent/40 hover:text-pw-accent cursor-pointer transition-colors duration-200">
              <Paperclip size={12} />
              Aggiungi file
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Bottoni */}
      <div className="flex justify-end gap-3 pt-2 border-t border-pw-border/40">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" loading={loading}>
          {task ? 'Aggiorna Task' : 'Crea Task'}
        </Button>
      </div>
    </form>
  );
}
