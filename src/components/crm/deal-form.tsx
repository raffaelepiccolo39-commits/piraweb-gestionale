'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { Profile, DealPriority } from '@/types/database';
import { SERVICE_CATEGORIES } from '@/types/database';
import { X } from 'lucide-react';

const SOURCE_LABELS: Record<string, string> = {
  website: 'Sito Web',
  referral: 'Referral',
  social_media: 'Social Media',
  cold_outreach: 'Cold Outreach',
  event: 'Evento',
  ads: 'Advertising',
  other: 'Altro',
};

const PRIORITY_OPTIONS: { value: DealPriority; label: string }[] = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Bassa' },
];

const EMPTY_FORM = {
  title: '',
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  value: '',
  monthly_value: '',
  source: 'other',
  priority: 'medium' as DealPriority,
  service_categories: [] as string[],
  tags: [] as string[],
  notes: '',
  expected_close_date: '',
  owner_id: '',
};

export type DealFormValues = typeof EMPTY_FORM;

interface DealFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: DealFormValues) => Promise<void> | void;
  members: Profile[];
  initialValues?: Partial<DealFormValues>;
  mode?: 'create' | 'edit';
}

export function DealForm({ open, onClose, onSubmit, members, initialValues, mode = 'create' }: DealFormProps) {
  const [form, setForm] = useState<DealFormValues>({ ...EMPTY_FORM, ...(initialValues || {}) });
  const [submitting, setSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Quando il modal si apre con initialValues diversi (es. cambio deal da editare), risincronizza
  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, ...(initialValues || {}) });
  }, [open, initialValues]);

  const toggleService = (val: string) => {
    setForm((f) => ({
      ...f,
      service_categories: f.service_categories.includes(val)
        ? f.service_categories.filter((s) => s !== val)
        : [...f.service_categories, val],
    }));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || form.tags.includes(t)) { setTagInput(''); return; }
    setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  };
  const removeTag = (t: string) => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm(EMPTY_FORM);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setForm(EMPTY_FORM);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={mode === 'edit' ? 'Modifica Deal' : 'Nuovo Deal'}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <Input
          label="Titolo deal"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Es: Gestione social per Acme Corp"
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Azienda"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            placeholder="Acme Corp"
          />
          <Input
            label="Nome contatto"
            value={form.contact_name}
            onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
            placeholder="Mario Rossi"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            placeholder="mario@acme.com"
          />
          <Input
            label="Telefono"
            value={form.contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            placeholder="+39 333..."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Valore deal (€)"
            type="number"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            placeholder="5000"
          />
          <Input
            label="Valore mensile (€)"
            type="number"
            value={form.monthly_value}
            onChange={(e) => setForm((f) => ({ ...f, monthly_value: e.target.value }))}
            placeholder="500"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Fonte"
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            options={Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Input
            label="Chiusura prevista"
            type="date"
            value={form.expected_close_date}
            onChange={(e) => setForm((f) => ({ ...f, expected_close_date: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Assegnato a"
            value={form.owner_id}
            onChange={(e) => setForm((f) => ({ ...f, owner_id: e.target.value }))}
            options={[{ value: '', label: 'Me stesso' }, ...members.map((m) => ({ value: m.id, label: m.full_name }))]}
          />
          <Select
            label="Priorità"
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as DealPriority }))}
            options={PRIORITY_OPTIONS}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-pw-text-muted mb-1.5">Servizi richiesti</label>
          <div className="flex flex-wrap gap-1.5">
            {SERVICE_CATEGORIES.map((s) => {
              const active = form.service_categories.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleService(s.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    active ? 'bg-pw-accent text-[#0A263A]' : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-pw-text-muted mb-1.5">Tag</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-pw-accent/15 text-pw-accent">
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`Rimuovi tag ${t}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
              if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
                removeTag(form.tags[form.tags.length - 1]);
              }
            }}
            onBlur={addTag}
            placeholder="Aggiungi un tag e premi ⏎ (es. urgente, top)"
          />
        </div>
        <Textarea
          label="Note"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{mode === 'edit' ? 'Salva modifiche' : 'Crea Deal'}</Button>
        </div>
      </div>
    </Modal>
  );
}
