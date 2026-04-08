'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Client } from '@/types/database';
import { Upload, X, ChevronDown } from 'lucide-react';

interface ClientFormProps {
  client?: Client;
  monthlyFee?: number;
  onSubmit: (data: ClientFormData) => Promise<void>;
  onCancel: () => void;
}

export interface ClientFormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
  ragione_sociale: string;
  partita_iva: string;
  codice_fiscale: string;
  codice_sdi: string;
  pec: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  monthly_fee?: number;
  logo?: File;
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-pw-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-pw-surface-2 hover:bg-pw-surface-3 transition-colors"
      >
        <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted">
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`text-pw-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

export function ClientForm({ client, monthlyFee, onSubmit, onCancel }: ClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(client?.logo_url || null);
  const [fee, setFee] = useState(monthlyFee?.toString() || '');
  const [form, setForm] = useState({
    name: client?.name || '',
    company: client?.company || '',
    email: client?.email || '',
    phone: client?.phone || '',
    website: client?.website || '',
    notes: client?.notes || '',
    ragione_sociale: client?.ragione_sociale || '',
    partita_iva: client?.partita_iva || '',
    codice_fiscale: client?.codice_fiscale || '',
    codice_sdi: client?.codice_sdi || '',
    pec: client?.pec || '',
    indirizzo: client?.indirizzo || '',
    cap: client?.cap || '',
    citta: client?.citta || '',
    provincia: client?.provincia || '',
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        ...form,
        monthly_fee: fee ? Number(fee) : undefined,
        logo: logoFile || undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const hasFiscalData = !!(client?.partita_iva || client?.codice_fiscale || client?.ragione_sociale);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Informazioni principali - sempre aperto */}
      <Section title="Informazioni Principali" defaultOpen>
        {/* Logo upload */}
        <div>
          <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
            Logo Cliente
          </label>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="relative">
                <div className="w-16 h-16 rounded-xl border border-pw-border overflow-hidden bg-white">
                  <Image src={logoPreview} alt="Logo" width={64} height={64} className="w-full h-full object-contain" />
                </div>
                <button
                  type="button"
                  onClick={removeLogo}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <X size={10} className="text-white" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="client-logo"
                className="w-16 h-16 rounded-xl border-2 border-dashed border-pw-border flex items-center justify-center cursor-pointer hover:border-pw-accent/50 transition-colors"
              >
                <Upload size={20} className="text-pw-text-dim" />
                <input
                  id="client-logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </label>
            )}
            <p className="text-xs text-pw-text-dim">PNG, JPG o SVG. Max 1MB.</p>
          </div>
        </div>

        <Input
          label="Nome Azienda *"
          value={form.company}
          onChange={(e) => update('company', e.target.value)}
          required
          placeholder="Nome dell'azienda"
        />
        <Input
          label="Referente Aziendale *"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          required
          placeholder="Nome e cognome del referente"
        />
      </Section>

      {/* Contatti */}
      <Section title="Contatti" defaultOpen={!!(client?.email || client?.phone)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="email@esempio.it"
          />
          <Input
            label="Telefono"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="+39 ..."
          />
        </div>
        <Input
          label="Sito Web"
          value={form.website}
          onChange={(e) => update('website', e.target.value)}
          placeholder="https://..."
        />
      </Section>

      {/* Mensilità - visibile solo in edit mode con contratto attivo */}
      {client && (
        <Section title="Mensilità" defaultOpen={!!monthlyFee}>
          <Input
            label="Canone Mensile (EUR)"
            type="number"
            min="0"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="es. 800"
          />
          {!monthlyFee && (
            <p className="text-xs text-pw-text-dim">
              Nessun contratto attivo. Per creare un contratto completo, vai nella scheda dettaglio del cliente.
            </p>
          )}
        </Section>
      )}

      {/* Dati fiscali */}
      <Section title="Dati Fiscali" defaultOpen={hasFiscalData}>
        <Input
          label="Ragione Sociale"
          value={form.ragione_sociale}
          onChange={(e) => update('ragione_sociale', e.target.value)}
          placeholder="Ragione sociale completa"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Partita IVA"
            value={form.partita_iva}
            onChange={(e) => update('partita_iva', e.target.value)}
            placeholder="IT12345678901"
          />
          <Input
            label="Codice Fiscale"
            value={form.codice_fiscale}
            onChange={(e) => update('codice_fiscale', e.target.value)}
            placeholder="RSSMRA80A01H501Z"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Codice SDI"
            value={form.codice_sdi}
            onChange={(e) => update('codice_sdi', e.target.value)}
            placeholder="Codice destinatario SDI"
          />
          <Input
            label="PEC"
            type="email"
            value={form.pec}
            onChange={(e) => update('pec', e.target.value)}
            placeholder="azienda@pec.it"
          />
        </div>
      </Section>

      {/* Indirizzo */}
      <Section title="Indirizzo" defaultOpen={!!(client?.indirizzo || client?.citta)}>
        <Input
          label="Indirizzo"
          value={form.indirizzo}
          onChange={(e) => update('indirizzo', e.target.value)}
          placeholder="Via Roma, 1"
        />
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="CAP"
            value={form.cap}
            onChange={(e) => update('cap', e.target.value)}
            placeholder="80100"
          />
          <Input
            label="Città"
            value={form.citta}
            onChange={(e) => update('citta', e.target.value)}
            placeholder="Napoli"
          />
          <Input
            label="Provincia"
            value={form.provincia}
            onChange={(e) => update('provincia', e.target.value)}
            placeholder="NA"
          />
        </div>
      </Section>

      {/* Note */}
      <Section title="Note" defaultOpen={!!client?.notes}>
        <Textarea
          label="Note"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Note aggiuntive sul cliente..."
          rows={3}
        />
      </Section>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" loading={loading}>
          {client ? 'Aggiorna' : 'Crea Cliente'}
        </Button>
      </div>
    </form>
  );
}
