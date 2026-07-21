'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError } from '@/lib/report-error';
import { BarChart3, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';

/**
 * I numeri del profilo, un mese per riga.
 *
 * Si caricano a mano una volta al mese finché Meta non approva il permesso
 * per leggerli in automatico. Un mese = una riga: ricaricandolo si corregge
 * invece di duplicare, così lo storico resta pulito anche quando qualcuno
 * sbaglia a digitare.
 */

interface Metrica {
  id: string;
  mese: string;
  follower: number | null;
  nuovi_follower: number | null;
  copertura: number | null;
  visualizzazioni: number | null;
  interazioni: number | null;
  visite_profilo: number | null;
  click_sito: number | null;
  nota: string | null;
}

const CAMPI: { chiave: keyof Metrica; etichetta: string; aiuto: string }[] = [
  { chiave: 'follower', etichetta: 'Follower totali', aiuto: 'quanti a fine mese' },
  { chiave: 'nuovi_follower', etichetta: 'Nuovi follower', aiuto: 'guadagnati nel mese' },
  { chiave: 'copertura', etichetta: 'Copertura', aiuto: 'persone diverse raggiunte' },
  { chiave: 'visualizzazioni', etichetta: 'Visualizzazioni', aiuto: 'quante volte in tutto' },
  { chiave: 'interazioni', etichetta: 'Interazioni', aiuto: 'like, commenti, salvataggi' },
  { chiave: 'visite_profilo', etichetta: 'Visite al profilo', aiuto: '' },
  { chiave: 'click_sito', etichetta: 'Click al sito', aiuto: '' },
];

const meseLeggibile = (m: string) =>
  new Date(m + 'T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

export function ClientMetrics({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const [righe, setRighe] = useState<Metrica[]>([]);
  const [loading, setLoading] = useState(true);
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);

  // Di default il mese appena concluso: è quello che si carica.
  const meseScorso = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const [mese, setMese] = useState(meseScorso);
  const [valori, setValori] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_metrics')
      .select('id, mese, follower, nuovi_follower, copertura, visualizzazioni, interazioni, visite_profilo, click_sito, nota')
      .eq('client_id', clientId)
      .order('mese', { ascending: false });

    if (error) reportSupabaseError(error, 'metriche-lista', { clientId });
    setRighe((data as Metrica[]) || []);
    setLoading(false);
  }, [clientId, supabase]);

  useEffect(() => { carica(); }, [carica]);

  const apriPerModifica = (m: Metrica) => {
    setMese(m.mese.slice(0, 7));
    setValori(Object.fromEntries(
      CAMPI.map((c) => [c.chiave, m[c.chiave] === null ? '' : String(m[c.chiave])])
    ));
    setNota(m.nota || '');
    setAperto(true);
  };

  const salva = async () => {
    if (!profile) return;
    setInvio(true);
    try {
      const numero = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[^\d-]/g, '')));

      const { error } = await supabase.from('client_metrics').upsert({
        client_id: clientId,
        mese: `${mese}-01`,
        ...Object.fromEntries(CAMPI.map((c) => [c.chiave, numero(valori[c.chiave] || '')])),
        nota: nota.trim() || null,
        created_by: profile.id,
      }, { onConflict: 'client_id,mese' });

      if (error) {
        reportSupabaseError(error, 'metriche-salva', { clientId, mese });
        toast.error('Errore nel salvataggio');
        return;
      }

      toast.success(`Report di ${meseLeggibile(mese + '-01')} salvato`);
      setAperto(false); setValori({}); setNota('');
      carica();
    } finally {
      setInvio(false);
    }
  };

  const elimina = async (m: Metrica) => {
    if (!confirm(`Eliminare il report di ${meseLeggibile(m.mese)}?`)) return;
    const { error } = await supabase.from('client_metrics').delete().eq('id', m.id);
    if (error) { toast.error('Errore'); return; }
    toast.success('Report eliminato');
    carica();
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-pw-accent" />
            <h3 className="text-base font-semibold text-pw-text">Report mensili</h3>
          </div>
          {!aperto && (
            <Button size="sm" variant="outline" onClick={() => { setValori({}); setNota(''); setMese(meseScorso); setAperto(true); }}>
              <Plus size={14} /> Carica un mese
            </Button>
          )}
        </div>
        <p className="text-xs text-pw-text-dim mb-4">
          Il cliente li vede nel portale con i confronti mese su mese, semestrali e annuali.
        </p>

        {aperto && (
          <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-4 mb-4 space-y-3">
            <div>
              <label className="block text-xs text-pw-text-dim mb-1">Mese di riferimento</label>
              <input
                type="month"
                value={mese}
                onChange={(e) => setMese(e.target.value)}
                className="px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              {CAMPI.map((c) => (
                <div key={c.chiave}>
                  <label className="block text-xs text-pw-text-dim mb-1">
                    {c.etichetta}
                    {c.aiuto && <span className="text-pw-text-dim/70"> — {c.aiuto}</span>}
                  </label>
                  <input
                    inputMode="numeric"
                    value={valori[c.chiave] || ''}
                    onChange={(e) => setValori({ ...valori, [c.chiave]: e.target.value })}
                    placeholder="—"
                    className="w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs text-pw-text-dim mb-1">
                Nota — cosa è successo quel mese (campagne, chiusure, un post andato bene)
              </label>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                placeholder="Fra sei mesi nessuno ricorderà perché quel mese spicca"
                className="w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
              <Button size="sm" variant="primary" onClick={salva} loading={invio}>Salva il mese</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4 text-pw-text-dim"><Loader2 size={16} className="animate-spin" /></div>
        ) : righe.length === 0 ? (
          <p className="text-sm text-pw-text-muted py-3 text-center">
            Nessun report caricato: il cliente non vede ancora nulla.
          </p>
        ) : (
          <div className="space-y-1.5">
            {righe.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-pw-border p-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-pw-text capitalize">{meseLeggibile(m.mese)}</p>
                  <p className="text-[11px] text-pw-text-dim">
                    {m.follower !== null && `${m.follower.toLocaleString('it-IT')} follower`}
                    {m.nuovi_follower !== null && ` · ${m.nuovi_follower > 0 ? '+' : ''}${m.nuovi_follower} nel mese`}
                    {m.copertura !== null && ` · ${m.copertura.toLocaleString('it-IT')} di copertura`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => apriPerModifica(m)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2" title="Modifica">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => elimina(m)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10" title="Elimina">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
