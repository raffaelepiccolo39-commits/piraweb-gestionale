'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ETICHETTE_SOURCE, SOURCE_ATTIVE } from '@/types/database';
import type { Profile } from '@/types/database';
import { todayLocal } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  membri: Profile[];
  ownerPredefinito: string;
  onClose: () => void;
  /** Restituisce l'errore, oppure null e l'eventuale avviso duplicati (V10). */
  onCrea: (dati: Record<string, unknown>) => Promise<{ errore?: string; avviso?: string }>;
}

const VUOTO = {
  title: '', company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  source: '', referrer: '', prossima_azione: '', data_prossima_azione: '',
};

/**
 * Creazione di un'opportunità.
 *
 * I campi obbligatori sono quelli delle validazioni V1, V2 e V7: provenienza,
 * eventuale segnalatore, e la prossima azione con la sua data. Sono pochi di
 * proposito — tutto il resto si riempie strada facendo, ma un'opportunità
 * senza prossima azione non deve nascere.
 */
export function NuovaOpportunita({ open, membri, ownerPredefinito, onClose, onCrea }: Props) {
  const [dati, setDati] = useState<Record<string, string>>(VUOTO);
  const [owner, setOwner] = useState(ownerPredefinito);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const set = (k: string, v: string) => setDati((d) => ({ ...d, [k]: v }));

  async function conferma() {
    setSalvando(true);
    setErrore(null);
    const esito = await onCrea({
      ...dati,
      owner_id: owner || ownerPredefinito,
      referrer: dati.referrer || null,
      stage_id: 0,
    });
    setSalvando(false);

    if (esito.errore) { setErrore(esito.errore); return; }
    if (esito.avviso) setAvviso(esito.avviso);
    setDati(VUOTO);
    onClose();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Nuova opportunità" size="lg">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Titolo" value={dati.title} onChange={(e) => set('title', e.target.value)} autoFocus
              placeholder="Es. Gestione social 2027" />
            <Input label="Azienda" value={dati.company_name} onChange={(e) => set('company_name', e.target.value)} />
            <Input label="Contatto" value={dati.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            <Input label="Email" type="email" value={dati.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
            <Input label="Telefono" value={dati.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
            <Select
              label="Provenienza"
              value={dati.source}
              onChange={(e) => set('source', e.target.value)}
              placeholder="Da dove arriva"
              options={SOURCE_ATTIVE.map((s) => ({ value: s, label: ETICHETTE_SOURCE[s] }))}
            />
            {dati.source === 'referral' && (
              <Input label="Chi ha segnalato" value={dati.referrer} onChange={(e) => set('referrer', e.target.value)} />
            )}
            <Select
              label="Owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              options={membri.map((m) => ({ value: m.id, label: m.full_name }))}
            />
          </div>

          <div className="grid gap-3 rounded-xl border border-pw-border/60 bg-pw-surface-2/40 p-3 sm:grid-cols-[1fr_180px]">
            <Input
              label="Prossima azione"
              value={dati.prossima_azione}
              onChange={(e) => set('prossima_azione', e.target.value)}
              placeholder="Es. chiamare per fissare la discovery"
            />
            <Input
              label="Quando"
              type="date"
              min={todayLocal()}
              value={dati.data_prossima_azione}
              onChange={(e) => set('data_prossima_azione', e.target.value)}
            />
          </div>

          {errore && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{errore}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={conferma} disabled={salvando}>{salvando ? 'Creazione…' : 'Crea'}</Button>
          </div>
        </div>
      </Modal>

      {/* V10: avviso non bloccante, dopo la creazione. */}
      <Modal open={!!avviso} onClose={() => setAvviso(null)} title="Attenzione ai doppioni" size="sm">
        <div className="space-y-3">
          <p className="flex gap-2 text-sm text-pw-text">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
            <span>{avviso}</span>
          </p>
          <p className="text-xs text-pw-text-dim">
            L&apos;opportunità è stata creata comunque: capita di lavorarne due sulla stessa azienda.
          </p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setAvviso(null)}>Ho capito</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
