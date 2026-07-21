'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportUnknown } from '@/lib/report-error';
import { leggiCsv, leggiPdf, type RigaPed } from '@/lib/ped-parser';
import type { Client } from '@/types/database';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, Trash2 } from 'lucide-react';

/**
 * Importa un piano editoriale da CSV o PDF.
 *
 * Non crea mai nulla alla cieca: prima mostra la tabella di ciò che ha
 * capito. Su un PDF l'estrazione è una lettura, non un dato — e trenta
 * contenuti sbagliati dentro il portale di un cliente sono peggio di dieci
 * minuti di controllo.
 */
export function ImportPed({
  clients,
  onFatto,
}: {
  clients: Client[];
  onFatto: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [aperto, setAperto] = useState(false);
  const [righe, setRighe] = useState<RigaPed[]>([]);
  const [cliente, setCliente] = useState('');
  const [nomeFile, setNomeFile] = useState('');
  const [leggendo, setLeggendo] = useState(false);
  const [creando, setCreando] = useState(false);

  const chiudi = () => {
    setAperto(false); setRighe([]); setNomeFile(''); setCliente('');
  };

  const leggi = async (file: File) => {
    setLeggendo(true);
    setNomeFile(file.name);
    try {
      const out = file.name.toLowerCase().endsWith('.csv')
        ? leggiCsv(await file.text())
        : await leggiPdf(file);

      if (out.length === 0) {
        toast.error('Non ho trovato contenuti: controlla che il file sia il piano editoriale');
        return;
      }
      setRighe(out);
    } catch (err) {
      reportUnknown(err, 'client', { op: 'ped-lettura', file: file.name });
      toast.error('Non sono riuscito a leggere il file');
    } finally {
      setLeggendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const crea = async () => {
    if (!cliente) { toast.error('Scegli il cliente'); return; }
    if (!profile) return;

    setCreando(true);
    try {
      const daCreare = righe.filter((r) => r.data && r.copy);

      const { error } = await supabase.from('social_posts').insert(
        daCreare.map((r) => ({
          client_id: cliente,
          // Il titolo serve al team nel calendario: la prima frase basta.
          title: (r.copy.split('\n').find((l) => l.length > 12) || 'Contenuto').slice(0, 70),
          caption: r.copy,
          platforms: ['instagram'],
          status: 'ready',
          formato: r.formato,
          // 10:00 italiane: l'orario esatto lo sistema chi programma.
          scheduled_at: new Date(`${r.data}T10:00:00`).toISOString(),
          created_by: profile.id,
        }))
      );

      if (error) {
        reportUnknown(error, 'client', { op: 'ped-crea', quanti: daCreare.length });
        toast.error(`Errore nella creazione: ${error.message}`);
        return;
      }

      toast.success(`${daCreare.length} contenuti creati — ora carica le foto`);
      chiudi();
      onFatto();
    } finally {
      setCreando(false);
    }
  };

  const valide = righe.filter((r) => r.data && r.copy).length;
  const conAvviso = righe.filter((r) => r.avviso).length;

  return (
    <>
      <Button variant="outline" onClick={() => setAperto(true)}>
        <Upload size={16} /> Importa PED
      </Button>

      <Modal open={aperto} onClose={chiudi} title="Importa un piano editoriale" size="lg">
        {righe.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
              <FileSpreadsheet size={24} className="text-pw-accent" />
            </div>
            <p className="text-sm text-pw-text-muted mb-1">
              Trascina il piano editoriale, oppure scegli il file.
            </p>
            <p className="text-xs text-pw-text-dim mb-5 max-w-sm mx-auto">
              Il <strong>CSV</strong> esportato da Notion è esatto. Dal <strong>PDF</strong> si
              legge tutto lo stesso, ma controlla la tabella prima di confermare.
            </p>

            <Button variant="primary" onClick={() => inputRef.current?.click()} loading={leggendo}>
              {leggendo ? 'Leggo il file…' : 'Scegli il file'}
            </Button>

            <p className="text-[11px] text-pw-text-dim mt-4">
              Le foto non arrivano dal file: si caricano dopo, contenuto per contenuto.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm text-pw-text">
                  <strong>{valide}</strong> contenuti da <span className="text-pw-text-dim">{nomeFile}</span>
                </p>
                {conAvviso > 0 && (
                  <p className="text-xs text-amber-500 inline-flex items-center gap-1 mt-0.5">
                    <AlertTriangle size={12} /> {conAvviso} da controllare
                  </p>
                )}
              </div>
              <div className="w-56">
                <Select
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  options={[
                    { value: '', label: 'Scegli il cliente…' },
                    ...clients.map((c) => ({ value: c.id, label: c.company || c.name })),
                  ]}
                />
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-pw-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-pw-surface-2">
                  <tr className="text-left text-xs text-pw-text-dim">
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Formato</th>
                    <th className="px-3 py-2 font-medium">Didascalia</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={i} className="border-t border-pw-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-pw-text">
                        {r.data
                          ? new Date(r.data + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
                          : <span className="text-red-500">manca</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={r.formato === 'reel' ? 'text-pw-accent' : 'text-pw-text-muted'}>
                          {r.formato}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-pw-text-muted">
                        <span className="line-clamp-2">{r.copy || <em className="text-red-500">vuota</em>}</span>
                        {r.avviso && (
                          <span className="block text-[11px] text-amber-500 mt-0.5">{r.avviso}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setRighe(righe.filter((_, j) => j !== i))}
                          className="p-1 rounded text-pw-text-dim hover:text-red-500"
                          title="Togli dalla lista"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 mt-4">
              <button onClick={() => { setRighe([]); setNomeFile(''); }} className="text-sm text-pw-text-dim underline">
                Cambia file
              </button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={chiudi}>Annulla</Button>
                <Button variant="primary" onClick={crea} loading={creando} disabled={!cliente || valide === 0}>
                  {creando ? <><Loader2 size={15} className="animate-spin" /> Creo…</> : `Crea ${valide} contenuti`}
                </Button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.pdf,text/csv,application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) leggi(f); }}
        />
      </Modal>
    </>
  );
}
