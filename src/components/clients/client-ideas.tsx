'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Lightbulb, Send, Loader2, Sparkles, Archive, Clock } from 'lucide-react';

/**
 * Il diario delle idee, dal lato nostro.
 *
 * Serve a due cose: leggere quello che il cliente ha buttato giù, e non
 * lasciarlo senza risposta. Un'idea che resta "nuova" per settimane insegna
 * al cliente che scrivere qui non serve — e allora torna su WhatsApp.
 */

type Stato = 'nuova' | 'in_lavorazione' | 'tenuta_da_parte';

interface Idea {
  id: string;
  autore: 'cliente' | 'team';
  testo: string;
  stato: Stato;
  risposta_team: string | null;
  created_at: string;
  portal_user: { full_name: string | null } | null;
  profilo: { full_name: string | null } | null;
}

const STATI: Record<Stato, { etichetta: string; icona: typeof Clock; classe: string }> = {
  nuova: { etichetta: 'Da valutare', icona: Clock, classe: 'bg-pw-surface-2 text-pw-text-dim' },
  in_lavorazione: { etichetta: 'La facciamo', icona: Sparkles, classe: 'bg-green-500/10 text-green-500' },
  tenuta_da_parte: { etichetta: 'Tenuta da parte', icona: Archive, classe: 'bg-amber-500/10 text-amber-500' },
};

const quando = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export function ClientIdeas({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const [idee, setIdee] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuova, setNuova] = useState('');
  const [invio, setInvio] = useState(false);
  const [inRisposta, setInRisposta] = useState<string | null>(null);
  const [risposta, setRisposta] = useState('');

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_ideas')
      .select('id, autore, testo, stato, risposta_team, created_at, portal_user:client_portal_users(full_name), profilo:profiles(full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) reportSupabaseError(error, 'idee-cliente-lista', { clientId });
    setIdee((data as unknown as Idea[]) || []);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => { carica(); }, [carica]);

  const proponi = async () => {
    if (!nuova.trim() || !profile) return;
    setInvio(true);
    try {
      const { error } = await supabase.from('client_ideas').insert({
        client_id: clientId,
        autore: 'team',
        profile_id: profile.id,
        testo: nuova.trim(),
      });
      if (error) { reportSupabaseError(error, 'idee-cliente-proposta', { clientId }); toast.error('Errore'); return; }
      setNuova('');
      toast.success('Proposta salvata — il cliente la vede nel suo diario');
      carica();
    } finally {
      setInvio(false);
    }
  };

  const valuta = async (id: string, stato: Stato) => {
    if (!profile) return;
    const { error } = await supabase
      .from('client_ideas')
      .update({
        stato,
        // La risposta si scrive solo se e' stata digitata: cambiare stato
        // senza commento non deve cancellare quello gia' dato.
        ...(risposta.trim() ? { risposta_team: risposta.trim() } : {}),
        valutata_da: profile.id,
        valutata_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { reportSupabaseError(error, 'idee-cliente-valuta', { id }); toast.error('Errore'); return; }
    setInRisposta(null);
    setRisposta('');
    toast.success('Il cliente vede la risposta nel suo diario');
    carica();
  };

  const daValutare = idee.filter((i) => i.autore === 'cliente' && i.stato === 'nuova').length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb size={18} className="text-pw-accent" />
          <h3 className="text-base font-semibold text-pw-text">Diario delle idee</h3>
          {daValutare > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-pw-accent text-[#0A263A] text-[10px] font-bold">
              {daValutare} da valutare
            </span>
          )}
        </div>
        <p className="text-xs text-pw-text-dim mb-4">
          Quello che il cliente butta giù, e le proposte che facciamo noi. Da rileggere quando si prepara il piano.
        </p>

        {/* Anche noi possiamo scrivere: un'idea nostra registrata qui e' una
            proposta che il cliente vede, non una cosa detta a voce e persa. */}
        <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-3 mb-4">
          <textarea
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            rows={2}
            placeholder="Proponi un'idea al cliente…"
            className="w-full bg-transparent text-sm text-pw-text placeholder:text-pw-text-dim resize-none focus:outline-none"
          />
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="soft" loading={invio} onClick={proponi} disabled={!nuova.trim()}>
              <Send size={13} /> Proponi
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4 text-pw-text-dim"><Loader2 size={16} className="animate-spin" /></div>
        ) : idee.length === 0 ? (
          <p className="text-sm text-pw-text-muted py-3 text-center">Nessuna idea, ancora.</p>
        ) : (
          <div className="space-y-2">
            {idee.map((i) => {
              const s = STATI[i.stato];
              const Icona = s.icona;
              const suo = i.autore === 'cliente';
              const chi = suo ? i.portal_user?.full_name : i.profilo?.full_name;
              return (
                <div key={i.id} className="rounded-xl border border-pw-border p-3">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-[11px] text-pw-text-dim">
                      {suo ? (chi || 'Il cliente') : `${chi || 'Team'} · nostra proposta`}
                      {' · '}{quando(i.created_at)}
                    </p>
                    <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', s.classe)}>
                      <Icona size={11} /> {s.etichetta}
                    </span>
                  </div>

                  <p className="text-sm text-pw-text whitespace-pre-wrap break-words">{i.testo}</p>

                  {i.risposta_team && (
                    <p className="mt-2 text-xs text-pw-text-muted border-l-2 border-pw-border pl-2">
                      {i.risposta_team}
                    </p>
                  )}

                  {inRisposta === i.id ? (
                    <div className="mt-2.5 space-y-2">
                      <textarea
                        value={risposta}
                        onChange={(e) => setRisposta(e.target.value)}
                        rows={2}
                        autoFocus
                        placeholder="Cosa ne pensiamo — lo legge il cliente"
                        className="w-full px-2.5 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim resize-none"
                      />
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setInRisposta(null); setRisposta(''); }}>
                          Annulla
                        </Button>
                        <Button size="sm" variant="soft" onClick={() => valuta(i.id, 'tenuta_da_parte')}>
                          <Archive size={13} /> Tieni da parte
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => valuta(i.id, 'in_lavorazione')}>
                          <Sparkles size={13} /> La facciamo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setInRisposta(i.id); setRisposta(i.risposta_team || ''); }}
                      className="mt-2 text-xs font-medium text-pw-accent hover:underline"
                    >
                      {i.stato === 'nuova' ? 'Valuta e rispondi' : 'Cambia risposta'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
