'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { ImagePlus, X } from 'lucide-react';
import type { DeveloperNote, DevNoteCategory, TaskPriority } from '@/types/database';

export interface NoteFormData {
  title: string;
  description: string;
  category: DevNoteCategory;
  priority: TaskPriority;
  screenshot?: File;
}

interface NoteDevFormProps {
  onSubmit: (data: NoteFormData) => Promise<void>;
  onCancel: () => void;
  existing?: DeveloperNote;
}

const categoryOptions = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Nuova Funzionalità' },
  { value: 'improvement', label: 'Miglioramento' },
];

const priorityOptions = [
  { value: 'low', label: 'Bassa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export function NoteDevForm({ onSubmit, onCancel, existing }: NoteDevFormProps) {
  const [form, setForm] = useState<NoteFormData>({
    title: existing?.title || '',
    description: existing?.description || '',
    category: existing?.category || 'bug',
    priority: existing?.priority || 'medium',
  });
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.screenshot_url || null);
  const [loading, setLoading] = useState(false);

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeScreenshot = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setScreenshot(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ ...form, screenshot: screenshot || undefined });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Titolo"
        placeholder="Descrivi brevemente il problema o la richiesta"
        value={form.title}
        onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Categoria"
          options={categoryOptions}
          value={form.category}
          onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as DevNoteCategory }))}
          required
        />
        <Select
          label="Priorità"
          options={priorityOptions}
          value={form.priority}
          onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
          required
        />
      </div>

      <Textarea
        label="Descrizione"
        placeholder="Spiega nel dettaglio cosa non funziona o cosa vorresti implementare..."
        rows={5}
        value={form.description}
        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        required
      />

      {/* Screenshot */}
      <div className="space-y-1.5">
        <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted">
          Screenshot (opzionale)
        </label>
        {previewUrl ? (
          <div className="relative inline-block">
            <img
              src={previewUrl}
              alt="Anteprima screenshot"
              className="max-h-40 rounded-xl border border-pw-border"
            />
            <button
              type="button"
              onClick={removeScreenshot}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-pw-border bg-pw-surface-2 cursor-pointer hover:border-pw-accent/50 transition-colors">
            <ImagePlus size={18} className="text-pw-text-muted" />
            <span className="text-sm text-pw-text-muted">Allega uno screenshot</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleScreenshot}
              className="hidden"
            />
          </label>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" loading={loading}>
          {existing ? 'Salva modifiche' : 'Invia nota'}
        </Button>
      </div>
    </form>
  );
}
