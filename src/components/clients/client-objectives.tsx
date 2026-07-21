'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Target, Plus, Loader2, Eye, EyeOff, Trash2, Pencil } from 'lucide-react';

/**
 * Gli obiettivi del cliente, dal lato nostro.
 *
 * Nascono NON pubblicati: un obiettivo si scrive, ci si pensa, magari lo si
 * concorda a voce, e solo dopo lo si mostra. Pubblicarlo mentre lo si sta
 * ancora formulando vorrebbe dire farglielo leggere a metà.
 */

type Periodo = 'trimestrale' | 'semestrale' | 'annuale';
type Stato = 'in_corso' | 'raggiunto' | 'non_raggiunto';

interface Obiettivo {
  id: string;
  titolo: string;
  descrizione: string | null;
  periodo: Periodo;
  data_inizio: string;
  data_fine: string;
  stato: Stato;
  progresso: number | null;
  esito: string | null;
  pubblicato: boolean;
}

const STATI: Record<Stato, { etichetta: string; classe: string }> = {
  in_corso: { etichetta: 'In corso', classe: 'bg-pw-accent/10 text-pw-accent' },
  raggiunto: { etichetta: 'Raggiunto', classe: 'bg-green-500/10 text-green-500' },
  non_raggiunto: { etichetta: 'Non raggiunto', classe: 'bg-pw-surface-2 text-pw-text-dim' },
};

const oggi = () => new Date().toISOString().slice(0, 10);

/** Fine del periodo a partire da oggi: risparmia di calcolarla a mano. */
function fineDi(periodo: Periodo): string {
  const d = new Date();
  d.setMonth(d.getMonth() + (periodo === 'trimestrale' ? 3 : periodo === 'semestrale' ? 6 : 12));
  return d.toISOString().slice(0, 10);
}

const vuoto = () => ({
  titolo: '', descrizione: '', periodo: 'trimestrale' as Periodo,
  data_inizio: oggi(), data_fine: fineDi('trimestrale'),
  stato: 'in_corso' as Stato, progresso: '' as string, esito: '',
});

export function ClientObjectives({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const [obiettivi, setObiettivi] = useState<Obiettivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [aperto, setAperto] = useState(false);
  const [modifica, setModifica] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const [form, setForm] = useState(vuoto());

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_objectives')
      .select('id, titolo, descrizione, periodo, data_inizio, data_fine, stato, progresso, esito, pubblicato')
      .eq('client_id', clientId)
      .order('data_fine', { ascending: false });

    if (error) reportSupabaseError(error, 'obiettivi-lista', { clientId });
    setObiettivi((data as Obiettivo[]) || []);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => { carica(); }, [carica]);

  const salva = async () => {
    if (!form.titolo.trim() || !profile) return;
    setInvio(true);
    try {
      const riga = {
        client_id: clientId,
        titolo: form.titolo.trim(),
        descrizione: form.descrizione.trim() || null,
        periodo: form.periodo,
        data_inizio: form.data_inizio,
        data_fine: form.data_fine,
        stato: form.stato,
        progresso: form.progresso.trim() === '' ? null : Number(form.progresso),
        esito: form.esito.trim() || null,
        created_by: profile.id,
      };

      const { error } = modifica
        ? await supabase.from('client_objectives').update(riga).eq('id', modifica)
        : await supabase.from('client_objectives').insert(riga);

      if (error) { reportSupabaseError(error, 'obiettivi-salva', { clientId }); toast.error('Errore'); return; }
      toast.success(modifica ? 'Obiettivo aggiornato' : 'Obiettivo creato — non è ancora visibile al cliente');
      setAperto(false); setModifica(null); setForm(vuoto());
      carica();
    } finally {
      setInvio(false);
    }
  };

  const pubblica = async (o: Obiettivo) => {
    const { error } = await supabase
      .from('client_objectives')
      .update({ pubblicato: !o.pubblicato })
      .eq('id', o.id);
    if (error) { toast.error('Errore'); return; }
    toast.success(o.pubblicato ? 'Nascosto al cliente' : 'Ora il cliente lo vede');
    carica();
  };

  const elimina = async (o: Obiettivo) => {
    if (!confirm(`Eliminare l'obiettivo "${o.titolo}"?`)) return;
    const { error } = await supabase.from('client_objectives').delete().eq('id', o.id);
    if (error) { toast.error('Errore'); return; }
    toast.success('Obiettivo eliminato');
    carica();
  };

  const apriModifica = (o: Obiettivo) => {
    setForm({
      titolo: o.titolo, descrizione: o.descrizione || '', periodo: o.periodo,
      data_inizio: o.data_inizio, data_fine: o.data_fine, stato: o.stato,
      progresso: o.progresso === null ? '' : String(o.progresso), esito: o.esito || '',
    });
    setModifica(o.id);
    setAperto(true);
  };

  const campo = 'w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text';

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-pw-accent" />
            <h3 className="text-base font-semibold text-pw-text">Obiettivi</h3>
          </div>
          {!aperto && (
            <Button size="sm" variant="outline" onClick={() => { setForm(vuoto()); setModifica(null); setAperto(true); }}>
              <Plus size={14} /> Nuovo obiettivo
            </Button>
          )}
        </div>
        <p className="text-xs text-pw-text-dim mb-4">
          Trimestrali, semestrali e annuali. Il cliente li vede sulla sua linea del tempo, ma solo quando li pubblichi.
        </p>

        {aperto && (
          <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-4 mb-4 space-y-3">
            <input
              value={form.titolo}
              onChange={(e) => setForm({ ...form, titolo: e.target.value })}
              placeholder="Obiettivo — es. Portare il profilo a 5.000 follower"
              className={campo}
            />
            <textarea
              value={form.descrizione}
              onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
              rows={2}
              placeholder="Come ci arriviamo (lo legge il cliente)"
              className={cn(campo, 'resize-none')}
            />

            <div className="grid sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-pw-text-dim mb-1">Periodo</label>
                <select
                  value={form.periodo}
                  onChange={(e) => {
                    const p = e.target.value as Periodo;
                    // La data di fine segue il periodo, ma resta modificabile:
                    // un trimestre puo' partire a meta' mese.
                    setForm({ ...form, periodo: p, data_fine: fineDi(p) });
                  }}
                  className={campo}
                >
                  <option value="trimestrale">Trimestrale</option>
                  <option value="semestrale">Semestrale</option>
                  <option value="annuale">Annuale</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-pw-text-dim mb-1">Dal</label>
                <input type="date" value={form.data_inizio}
                  onChange={(e) => setForm({ ...form, data_inizio: e.target.value })} className={campo} />
              </div>
              <div>
                <label className="block text-xs text-pw-text-dim mb-1">Al</label>
                <input type="date" value={form.data_fine}
                  onChange={(e) => setForm({ ...form, data_fine: e.target.value })} className={campo} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-pw-text-dim mb-1">Stato</label>
                <select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value as Stato })} className={campo}>
                  <option value="in_corso">In corso</option>
                  <option value="raggiunto">Raggiunto</option>
                  <option value="non_raggiunto">Non raggiunto</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-pw-text-dim mb-1">
                  Avanzamento % <span className="text-pw-text-dim/70">— lascia vuoto se non si misura</span>
                </label>
                <input inputMode="numeric" value={form.progresso}
                  onChange={(e) => setForm({ ...form, progresso: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                  placeholder="—" className={campo} />
              </div>
            </div>

            {form.stato !== 'in_corso' && (
              <textarea
                value={form.esito}
                onChange={(e) => setForm({ ...form, esito: e.target.value })}
                rows={2}
                placeholder="Com'è andata — lo legge il cliente, e su un obiettivo mancato è la parte che conta"
                className={cn(campo, 'resize-none')}
              />
            )}

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAperto(false); setModifica(null); }}>Annulla</Button>
              <Button size="sm" variant="primary" onClick={salva} loading={invio} disabled={!form.titolo.trim()}>
                {modifica ? 'Salva le modifiche' : 'Crea obiettivo'}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4 text-pw-text-dim"><Loader2 size={16} className="animate-spin" /></div>
        ) : obiettivi.length === 0 ? (
          <p className="text-sm text-pw-text-muted py-3 text-center">Nessun obiettivo per questo cliente.</p>
        ) : (
          <div className="space-y-2">
            {obiettivi.map((o) => (
              <div key={o.id} className="rounded-xl border border-pw-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pw-text">{o.titolo}</p>
                    <p className="text-[11px] text-pw-text-dim mt-0.5">
                      {o.periodo} · {o.data_inizio} → {o.data_fine}
                      {o.progresso !== null && ` · ${o.progresso}%`}
                    </p>
                  </div>
                  <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium', STATI[o.stato].classe)}>
                    {STATI[o.stato].etichetta}
                  </span>
                </div>

                <div className="flex items-center gap-1 mt-2">
                  <button
                    onClick={() => pubblica(o)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium',
                      o.pubblicato ? 'text-green-500 hover:bg-green-500/10' : 'text-pw-text-dim hover:bg-pw-surface-2'
                    )}
                  >
                    {o.pubblicato ? <><Eye size={12} /> Il cliente lo vede</> : <><EyeOff size={12} /> Non pubblicato</>}
                  </button>
                  <button onClick={() => apriModifica(o)} className="ml-auto p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2" title="Modifica">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => elimina(o)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10" title="Elimina">
                    <Trash2 size={13} />
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
