'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Client } from '@/types/database';
import { Upload, X } from 'lucide-react';

interface ClientFormProps {
  client?: Client;
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
  logo?: File;
}

export function ClientForm({ client, onSubmit, onCancel }: ClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(client?.logo_url || null);
  const [showFiscal, setShowFiscal] = useState(
    !!(client?.partita_iva || client?.codice_fiscale || client?.ragione_sociale)
  );
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
      await onSubmit({ ...form, logo: logoFile || undefined });
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        id="company"
        label="Nome Azienda *"
        value={form.company}
        onChange={(e) => update('company', e.target.value)}
        required
        placeholder="Nome dell'azienda"
      />
      <Input
        id="name"
        label="Referente Aziendale *"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
        required
        placeholder="Nome e cognome del referente"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          id="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="email@esempio.it"
        />
        <Input
          id="phone"
          label="Telefono"
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="+39 ..."
        />
      </div>
      <Input
        id="website"
        label="Sito Web"
        value={form.website}
        onChange={(e) => update('website', e.target.value)}
        placeholder="https://..."
      />

      {/* Dati fiscali toggle */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowFiscal(!showFiscal)}
          className="text-sm text-pw-accent hover:text-pw-accent-hover transition-colors"
        >
          {showFiscal ? '- Nascondi dati fiscali' : '+ Aggiungi dati fiscali'}
        </button>
      </div>

      {showFiscal && (
        <div className="space-y-4 pt-2 border-t border-pw-border">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted">
            Dati Fiscali
          </p>
          <Input
            id="ragione_sociale"
            label="Ragione Sociale"
            value={form.ragione_sociale}
            onChange={(e) => update('ragione_sociale', e.target.value)}
            placeholder="Ragione sociale completa"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="partita_iva"
              label="Partita IVA"
              value={form.partita_iva}
              onChange={(e) => update('partita_iva', e.target.value)}
              placeholder="IT12345678901"
            />
            <Input
              id="codice_fiscale"
              label="Codice Fiscale"
              value={form.codice_fiscale}
              onChange={(e) => update('codice_fiscale', e.target.value)}
              placeholder="RSSMRA80A01H501Z"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="codice_sdi"
              label="Codice SDI"
              value={form.codice_sdi}
              onChange={(e) => update('codice_sdi', e.target.value)}
              placeholder="Codice destinatario SDI"
            />
            <Input
              id="pec"
              label="PEC"
              type="email"
              value={form.pec}
              onChange={(e) => update('pec', e.target.value)}
              placeholder="azienda@pec.it"
            />
          </div>
          <Input
            id="indirizzo"
            label="Indirizzo"
            value={form.indirizzo}
            onChange={(e) => update('indirizzo', e.target.value)}
            placeholder="Via Roma, 1"
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              id="cap"
              label="CAP"
              value={form.cap}
              onChange={(e) => update('cap', e.target.value)}
              placeholder="80100"
            />
            <Input
              id="citta"
              label="Città"
              value={form.citta}
              onChange={(e) => update('citta', e.target.value)}
              placeholder="Napoli"
            />
            <Input
              id="provincia"
              label="Provincia"
              value={form.provincia}
              onChange={(e) => update('provincia', e.target.value)}
              placeholder="NA"
            />
          </div>
        </div>
      )}

      <Textarea
        id="notes"
        label="Note"
        value={form.notes}
        onChange={(e) => update('notes', e.target.value)}
        placeholder="Note aggiuntive sul cliente..."
        rows={3}
      />
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
