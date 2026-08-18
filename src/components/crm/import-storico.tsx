'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { reportUnknown } from '@/lib/report-error';
import { Upload } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onFatto: () => void;
}

interface Esito {
  creati: number;
  scartate: number;
  errori: { numero: number; azienda: string; motivo: string }[];
  csv_errori: string | null;
}

const TRACCIATO =
  'azienda;contatto;email;telefono;source;referrer;stage;prossima_azione;data_prossima_azione;canone_proposto;una_tantum_proposto;note';

/**
 * Import dello storico commerciale (§11).
 *
 * Le righe scartate tornano indietro con il motivo, una per una: un import
 * che dice solo "12 su 20" costringe a indovinare quali otto e perché.
 */
export function ImportStorico({ open, onClose, onFatto }: Props) {
  const [csv, setCsv] = useState('');
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function leggiFile(file: File) {
    setCsv(await file.text());
    setEsito(null);
    setErrore(null);
  }

  async function importa() {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch('/api/crm/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const dati = await risposta.json();
      if (!risposta.ok) { setErrore(dati.error ?? 'Import non riuscito'); return; }
      setEsito(dati as Esito);
      onFatto();
    } catch (e) {
      reportUnknown(e, 'client', { route: '/crm', azione: 'import' });
      setErrore('Connessione non riuscita');
    } finally {
      setInCorso(false);
    }
  }

  function scaricaErrori() {
    if (!esito?.csv_errori) return;
    const url = URL.createObjectURL(new Blob([esito.csv_errori], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crm-import-errori.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal open={open} onClose={onClose} title="Importa lo storico" size="lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-pw-border/60 bg-pw-surface-2/40 p-3">
          <p className="text-xs text-pw-text-dim">Tracciato atteso, separatore punto e virgola:</p>
          <code className="mt-1 block overflow-x-auto whitespace-pre text-[11px] text-pw-text">{TRACCIATO}</code>
          <p className="mt-2 text-xs text-pw-text-dim">
            Colonna facoltativa in coda: <code>data_ingresso</code> — la data reale di inizio trattativa,
            così i tempi dello storico non partono tutti dal giorno dell&apos;import.
          </p>
        </div>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void leggiFile(f); }}
          className="block w-full text-sm text-pw-text file:mr-3 file:rounded-lg file:border-0 file:bg-pw-surface-2 file:px-3 file:py-2 file:text-sm file:text-pw-text"
        />

        <Textarea
          label="Oppure incolla qui il contenuto"
          rows={6}
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setEsito(null); }}
          placeholder={TRACCIATO}
        />

        {errore && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{errore}</p>}

        {esito && (
          <div className="space-y-2 rounded-xl border border-pw-border/60 p-3">
            <p className="text-sm text-pw-text">
              <span className="font-semibold">{esito.creati}</span> opportunità create,{' '}
              <span className="font-semibold">{esito.scartate}</span> righe scartate.
            </p>
            {esito.errori.length > 0 && (
              <>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-pw-text-dim">
                  {esito.errori.map((e) => (
                    <li key={e.numero}>Riga {e.numero} ({e.azienda || 'senza azienda'}): {e.motivo}</li>
                  ))}
                </ul>
                <Button size="sm" variant="secondary" onClick={scaricaErrori}>Scarica il CSV degli errori</Button>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Chiudi</Button>
          <Button onClick={importa} disabled={inCorso || !csv.trim()}>
            <Upload size={14} />
            {inCorso ? 'Import in corso…' : 'Importa'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
