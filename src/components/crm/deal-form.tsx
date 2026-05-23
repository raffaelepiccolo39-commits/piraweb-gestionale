'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { Profile } from '@/types/database';

const SOURCE_LABELS: Record<string, string> = {
  website: 'Sito Web',
  referral: 'Referral',
  social_media: 'Social Media',
  cold_outreach: 'Cold Outreach',
  event: 'Evento',
  ads: 'Advertising',
  other: 'Altro',
};

const EMPTY_FORM = {
  title: '',
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  value: '',
  monthly_value: '',
  source: 'other',
  services: '',
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
}

export function DealForm({ open, onClose, onSubmit, members }: DealFormProps) {
  const [form, setForm] = useState<DealFormValues>(EMPTY_FORM);
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
    <Modal open={open} onClose={handleClose} title="Nuovo Deal">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <Input
          label="Titolo deal"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Es: Gestione social per Acme Corp"
          required
        />
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="grid grid-cols-2 gap-4">
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
        <Select
          label="Assegnato a"
          value={form.owner_id}
          onChange={(e) => setForm((f) => ({ ...f, owner_id: e.target.value }))}
          options={[{ value: '', label: 'Me stesso' }, ...members.map((m) => ({ value: m.id, label: m.full_name }))]}
        />
        <Textarea
          label="Servizi richiesti"
          value={form.services}
          onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
          placeholder="Social media management, branding, sito web..."
          rows={2}
        />
        <Textarea
          label="Note"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={submitting}>Crea Deal</Button>
        </div>
      </div>
    </Modal>
  );
}
