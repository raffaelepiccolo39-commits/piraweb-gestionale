'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Camera, Loader2, Check, X, Clock } from 'lucide-react';

/**
 * Le date di shooting proposte dal cliente dal portale.
 *
 * Alla conferma si crea anche l'evento in calendario: senza, la data
 * resterebbe confermata solo qui e qualcuno potrebbe prenderci un altro
 * impegno sopra.
 */

type Fascia = 'mattina' | 'pomeriggio' | 'giornata';

interface Richiesta {
  id: string;
  data_richiesta: string;
  fascia: Fascia;
  nota_cliente: string | null;
  stato: 'proposta' | 'confermata' | 'rifiutata';
  risposta_team: string | null;
  created_at: string;
}

const ORARI: Record<Fascia, { da: string; a: string; testo: string }> = {
  mattina: { da: '09:00', a: '13:00', testo: 'Mattina' },
  pomeriggio: { da: '14:00', a: '18:00', testo: 'Pomeriggio' },
  giornata: { da: '09:00', a: '18:00', testo: 'Tutto il giorno' },
};

export function ShootingRequests({ clientId, clientName }: { clientId: string; clientName: string }) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const [richieste, setRichieste] = useState<Richiesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [rispostaA, setRispostaA] = useState<string | null>(null);
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('shooting_requests')
      .select('id, data_richiesta, fascia, nota_cliente, stato, risposta_team, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) reportSupabaseError(error, 'shooting-richieste', { clientId });
    setRichieste((data as Richiesta[]) || []);
    setLoading(false);
  }, [clientId, supabase]);

  useEffect(() => { carica(); }, [carica]);

  const rispondi = async (r: Richiesta, conferma: boolean) => {
    if (!profile) return;
    setInvio(true);
    try {
      let eventId: string | null = null;

      if (conferma) {
        // La data va bloccata in calendario, o resterebbe confermata solo qui
        // e qualcuno ci prenderebbe un altro impegno sopra.
        const { da, a } = ORARI[r.fascia];
        const { data: ev, error: evErr } = await supabase
          .from('calendar_events')
          .insert({
            title: `Shooting ${clientName}`,
            description: r.nota_cliente || null,
            start_time: new Date(`${r.data_richiesta}T${da}:00`).toISOString(),
            end_time: new Date(`${r.data_richiesta}T${a}:00`).toISOString(),
            event_type: 'shooting',
            client_id: clientId,
            created_by: profile.id,
          })
          .select('id')
          .single();

        if (evErr) {
          reportSupabaseError(evErr, 'shooting-crea-evento', { richiesta: r.id });
          toast.error('Non è stato possibile creare l\'evento in calendario');
          return;
        }
        eventId = ev.id;
      }

      const { error } = await supabase
        .from('shooting_requests')
        .update({
          stato: conferma ? 'confermata' : 'rifiutata',
          risposta_team: testo.trim() || null,
          calendar_event_id: eventId,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', r.id);

      if (error) {
        reportSupabaseError(error, 'shooting-risposta', { richiesta: r.id });
        toast.error('Errore nel salvataggio');
        return;
      }

      toast.success(conferma ? 'Shooting confermato e messo in calendario' : 'Data rifiutata: il cliente ne proporrà un\'altra');
      setRispostaA(null); setTesto('');
      carica();
    } finally {
      setInvio(false);
    }
  };

  const inAttesa = richieste.filter((r) => r.stato === 'proposta');
  const storiche = richieste.filter((r) => r.stato !== 'proposta').slice(0, 3);

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex justify-center text-pw-text-dim">
        <Loader2 size={18} className="animate-spin" />
      </CardContent></Card>
    );
  }

  if (richieste.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Camera size={18} className="text-pw-accent" />
          <h3 className="text-base font-semibold text-pw-text">Shooting proposti dal cliente</h3>
          {inAttesa.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-pw-accent text-[#0A263A] text-[11px] font-bold">
              {inAttesa.length}
            </span>
          )}
        </div>
        <p className="text-xs text-pw-text-dim mb-4">
          Confermando, la data finisce in calendario come shooting.
        </p>

        <div className="space-y-2">
          {[...inAttesa, ...storiche].map((r) => (
            <div key={r.id} className="rounded-xl border border-pw-border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-pw-text">
                    {new Date(r.data_richiesta + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs text-pw-text-dim">
                    {ORARI[r.fascia].testo} · {ORARI[r.fascia].da}-{ORARI[r.fascia].a}
                  </p>
                  {r.nota_cliente && (
                    <p className="text-xs text-pw-text-muted italic mt-1">«{r.nota_cliente}»</p>
                  )}
                </div>
                <span className={cn(
                  'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium',
                  r.stato === 'confermata' ? 'bg-green-500/10 text-green-500'
                    : r.stato === 'rifiutata' ? 'bg-red-500/10 text-red-500'
                    : 'bg-pw-accent/10 text-pw-accent'
                )}>
                  {r.stato === 'confermata' ? <><Check size={11} /> Confermato</>
                    : r.stato === 'rifiutata' ? <><X size={11} /> Rifiutato</>
                    : <><Clock size={11} /> Da confermare</>}
                </span>
              </div>

              {r.stato === 'proposta' && (
                rispostaA === r.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={testo}
                      onChange={(e) => setTesto(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="Un messaggio per il cliente (facoltativo)"
                      className="w-full px-3 py-2 rounded-lg bg-pw-surface-2 border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setRispostaA(null); setTesto(''); }}>Annulla</Button>
                      <Button size="sm" variant="outline" onClick={() => rispondi(r, false)} loading={invio}>
                        <X size={13} /> Rifiuta
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => rispondi(r, true)} loading={invio}>
                        <Check size={13} /> Conferma
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="primary" onClick={() => rispondi(r, true)} loading={invio}>
                      <Check size={13} /> Conferma
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRispostaA(r.id); setTesto(''); }}>
                      Rispondi o rifiuta
                    </Button>
                  </div>
                )
              )}

              {r.risposta_team && r.stato !== 'proposta' && (
                <p className="text-xs text-pw-text-muted italic mt-2">Risposta: «{r.risposta_team}»</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
