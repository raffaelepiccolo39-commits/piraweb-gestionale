'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { Loader2, Lightbulb, Send, Sparkles, Archive, Clock } from 'lucide-react';

/**
 * Il diario delle idee.
 *
 * Le idee arrivano sempre nel momento sbagliato: in chiamata, di sera su
 * WhatsApp, mentre si parla d'altro. Chi le riceve se le segna dove capita e
 * al momento di preparare il piano non se le ricorda nessuno.
 *
 * Non è la conversazione — lì si chiede e si risponde. Qui si deposita
 * qualcosa che vale la pena rileggere fra due mesi. Per questo ogni idea
 * mostra che fine ha fatto: un diario in cui si scrive senza mai vedere una
 * risposta smette di essere usato dopo la terza volta.
 */

interface Idea {
  id: string;
  autore: 'cliente' | 'team';
  testo: string;
  stato: 'nuova' | 'in_lavorazione' | 'tenuta_da_parte';
  risposta_team: string | null;
  created_at: string;
  portal_user: { full_name: string | null } | null;
  profilo: { full_name: string | null } | null;
}

const STATI = {
  nuova: { etichetta: 'La stiamo leggendo', icona: Clock, classe: 'bg-pw-surface-2 text-pw-text-dim' },
  in_lavorazione: { etichetta: 'La stiamo facendo', icona: Sparkles, classe: 'bg-green-500/10 text-green-600 dark:text-green-500' },
  tenuta_da_parte: { etichetta: 'Tenuta da parte', icona: Archive, classe: 'bg-amber-500/10 text-amber-600 dark:text-amber-500' },
} as const;

const quando = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PortaleDiarioPage() {
  const supabase = createClient();
  const toast = useToast();

  const [idee, setIdee] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_ideas')
      // La chiave esterna va nominata: client_ideas punta a profiles due
      // volte (chi ha scritto e chi ha valutato) e senza indicarla PostgREST
      // rifiuta la query invece di sceglierne una.
      .select('id, autore, testo, stato, risposta_team, created_at, portal_user:client_portal_users(full_name), profilo:profiles!client_ideas_profile_id_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) reportSupabaseError(error, 'portale-diario', {});
    setIdee((data as unknown as Idea[]) || []);
    setLoading(false);

    // Aprire il diario vale come averle viste: la campanella si spegne senza
    // chiedere al cliente di premere un pulsante in piu'.
    await supabase.rpc('portal_segna_idee_lette');
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  const invia = async () => {
    if (!testo.trim()) return;
    setInvio(true);
    try {
      const { error } = await supabase.rpc('portal_scrivi_idea', { p_testo: testo.trim() });
      if (error) {
        reportSupabaseError(error, 'portale-diario-invio', {});
        // I messaggi della funzione sono scritti per essere letti dal cliente.
        toast.error(error.message || 'Non sono riuscito a salvare l’idea');
        return;
      }
      setTesto('');
      toast.success('Idea salvata — la leggiamo noi');
      carica();
    } finally {
      setInvio(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-pw-text">Diario delle idee</h2>
        <p className="text-sm text-pw-text-muted">
          Ti viene in mente qualcosa? Scrivila qui, anche buttata giù male.
          La leggiamo e ti diciamo cosa ne pensiamo.
        </p>
      </div>

      {/* Il campo per scrivere sta in alto: e' il motivo per cui si apre
          questa pagina. In fondo a un elenco lungo non lo troverebbe piu'. */}
      <div className="rounded-2xl border border-pw-border bg-pw-surface p-3 mb-5">
        <textarea
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Un'idea per un video, un prodotto da spingere, una cosa vista in giro che ti è piaciuta…"
          className="w-full bg-transparent text-sm text-pw-text placeholder:text-pw-text-dim resize-none focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-pw-border">
          <span className="text-[11px] text-pw-text-dim">
            {testo.length > 3500 ? `${4000 - testo.length} caratteri rimasti` : 'Nessuna idea è banale'}
          </span>
          <button
            onClick={invia}
            disabled={invio || !testo.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-pw-accent px-3.5 py-2 text-xs font-semibold text-[#0A263A] disabled:opacity-40 transition-opacity"
          >
            {invio ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Salva l’idea
          </button>
        </div>
      </div>

      {idee.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-3">
            <Lightbulb size={24} className="text-pw-accent" />
          </div>
          <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
            Il diario è ancora vuoto. Le idee che scrivi qui restano, e le
            riguardiamo ogni volta che prepariamo il piano del mese.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {idee.map((i) => {
            const stato = STATI[i.stato];
            const Icona = stato.icona;
            const mia = i.autore === 'cliente';
            const chi = mia ? i.portal_user?.full_name : i.profilo?.full_name;
            return (
              <div key={i.id} className="rounded-2xl border border-pw-border bg-pw-surface p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-[11px] text-pw-text-dim">
                    {mia ? (chi || 'Tu') : `${chi || 'Pira Web'} · nostra proposta`}
                    {' · '}{quando(i.created_at)}
                  </p>
                  <span className={cn(
                    'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    stato.classe
                  )}>
                    <Icona size={11} /> {stato.etichetta}
                  </span>
                </div>

                <p className="text-sm text-pw-text whitespace-pre-wrap break-words">{i.testo}</p>

                {/* La risposta conta piu' dello stato: "tenuta da parte" senza
                    una spiegazione sembra un no e basta. */}
                {i.risposta_team && (
                  <div className="mt-3 pt-3 border-t border-pw-border">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-accent mb-1">
                      Cosa ne pensiamo
                    </p>
                    <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{i.risposta_team}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
