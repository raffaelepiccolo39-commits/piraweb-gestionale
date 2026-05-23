'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const EMPTY_FORM = {
  type: 'note',
  title: '',
  description: '',
  scheduled_at: '',
};

export type ActivityFormValues = typeof EMPTY_FORM;

interface ActivityFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ActivityFormValues) => Promise<void> | void;
}

export function ActivityForm({ open, onClose, onSubmit }: ActivityFormProps) {
  const [form, setForm] = useState<ActivityFormValues>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

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
    <Modal open={open} onClose={handleClose} title="Nuova Attivita'">
      <div className="space-y-4">
        <Select
          label="Tipo"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          options={[
            { value: 'call', label: 'Chiamata' },
            { value: 'email', label: 'Email' },
            { value: 'meeting', label: 'Meeting' },
            { value: 'note', label: 'Nota' },
            { value: 'proposal_sent', label: 'Proposta inviata' },
            { value: 'follow_up', label: 'Follow-up' },
          ]}
        />
        <Input
          label="Titolo"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Es: Call conoscitiva"
          required
        />
        <Textarea
          label="Dettagli"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
        />
        <Input
          label="Data/ora (opzionale)"
          type="datetime-local"
          value={form.scheduled_at}
          onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={submitting}>Salva</Button>
        </div>
      </div>
    </Modal>
  );
}
