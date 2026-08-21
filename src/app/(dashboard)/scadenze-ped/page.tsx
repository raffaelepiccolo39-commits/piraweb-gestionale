'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonList } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { CalendarClock, Loader2, Check } from 'lucide-react';
import { reportSupabaseError } from '@/lib/report-error';

/**
 * Fino a quando è coperto il piano editoriale di ogni cliente.
 *
 * Esiste perché prima questa informazione non stava da nessuna parte: c'era
 * il riquadro in dashboard, ma elenca solo i clienti a cui la data MANCA e li
 * fa sparire appena la imposti. Per chi produce i contenuti la domanda è
 * l'opposta — fino a quando siamo coperti, e chi sta per scadere.
 *
 * Chi può cambiare la data: `set_ped_coverage` è SECURITY DEFINER e accetta
 * solo admin e social_media_manager (migration 20260712b). Qui la stessa
 * regola decide se mostrare il campo o il solo testo: un campo che risponde
 * "Non autorizzato" è peggio di un campo assente.
 */

interface Riga {
  clientId: string;
  nome: string;
  copertoFino: string | null;
}

const GIORNO = 86400000;

/** Giorni che mancano, con la gravità che ne consegue. */
function stato(copertoFino: string | null, oggi: number) {
  if (!copertoFino) {
    return { giorni: null, tono: 'neutral' as const, testo: 'Da impostare' };
  }
  const giorni = Math.ceil((new Date(copertoFino + 'T12:00:00').getTime() - oggi) / GIORNO);
  if (giorni < 0) return { giorni, tono: 'danger' as const, testo: 'Scaduto' };
  if (giorni === 0) return { giorni, tono: 'danger' as const, testo: 'Scade oggi' };
  if (giorni <= 7) return { giorni, tono: 'danger' as const, testo: `${giorni} giorni` };
  if (giorni <= 15) return { giorni, tono: 'warning' as const, testo: `${giorni} giorni` };
  return { giorni, tono: 'success' as const, testo: `${giorni} giorni` };
}

const dataEstesa = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

export default function ScadenzePedPage() {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const puoModificare = profile?.role === 'admin' || profile?.role === 'social_media_manager';

  const [righe, setRighe] = useState<Riga[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState<string | null>(null);
  const [salvato, setSalvato] = useState<string | null>(null);

  // Letto una volta all'apertura: leggere l'orologio a ogni render è impuro e
  // farebbe ricalcolare tutti i conteggi a ogni battuta di tasto.
  const [oggi] = useState(() => Date.now());

  const carica = useCallback(async () => {
    const [clientiRes, coperturaRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, company')
        .eq('is_active', true)
        .eq('needs_ped', true)
        .is('paused_at', null),
      supabase.from('client_ped_coverage').select('client_id, covered_until'),
    ]);

    // Senza questo una lettura fallita mostrerebbe "nessun cliente", che è
    // un'informazione credibile e falsa.
    const guasto = clientiRes.error ?? coperturaRes.error;
    if (guasto) {
      reportSupabaseError(guasto, 'scadenze-ped-carica');
      setErrore(guasto.message);
      setCaricamento(false);
      return;
    }

    const copertura = new Map<string, string | null>();
    for (const c of (coperturaRes.data as { client_id: string; covered_until: string | null }[]) ?? []) {
      copertura.set(c.client_id, c.covered_until);
    }

    setRighe(
      ((clientiRes.data as { id: string; name: string; company: string | null }[]) ?? []).map((c) => ({
        clientId: c.id,
        nome: c.company || c.name,
        copertoFino: copertura.get(c.id) ?? null,
      })),
    );
    setErrore(null);
    setCaricamento(false);
  }, [supabase]);

  useEffect(() => { void carica(); }, [carica]);

  // Prima chi non ha la data (è l'unica riga su cui si può agire), poi in
  // ordine di scadenza: chi scade prima sta in alto, che è il motivo per cui
  // si apre questa pagina.
  const ordinate = useMemo(() => {
    return [...righe].sort((a, b) => {
      if (!a.copertoFino && !b.copertoFino) return a.nome.localeCompare(b.nome);
      if (!a.copertoFino) return -1;
      if (!b.copertoFino) return 1;
      return a.copertoFino.localeCompare(b.copertoFino) || a.nome.localeCompare(b.nome);
    });
  }, [righe]);

  const salva = async (clientId: string, data: string) => {
    if (!data) return;
    const precedente = righe.find((r) => r.clientId === clientId)?.copertoFino ?? null;
    setRighe((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, copertoFino: data } : r)));
    setSalvataggio(clientId);

    const { error } = await supabase.rpc('set_ped_coverage', {
      p_client_id: clientId,
      p_covered_until: data,
    });
    setSalvataggio(null);

    if (error) {
      reportSupabaseError(error, 'scadenze-ped-salva', { clientId });
      toast.error(error.message || 'Salvataggio non riuscito');
      // Torna al valore di prima: lasciare a schermo una data non salvata
      // farebbe credere che il piano sia coperto quando non lo è.
      setRighe((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, copertoFino: precedente } : r)));
      return;
    }
    setSalvato(clientId);
    setTimeout(() => setSalvato((s) => (s === clientId ? null : s)), 900);
  };

  const daImpostare = righe.filter((r) => !r.copertoFino).length;

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Scadenze piani editoriali"
        subtitle={
          caricamento
            ? 'Carico…'
            : daImpostare > 0
              ? `${righe.length} clienti · ${daImpostare} senza data`
              : `${righe.length} clienti, tutti programmati`
        }
      />

      {errore ? (
        <ErrorState
          titolo="Non è stato possibile leggere le scadenze"
          dettaglio={errore}
          onRiprova={() => { setCaricamento(true); setErrore(null); void carica(); }}
        />
      ) : caricamento ? (
        <SkeletonList variant="row" count={6} />
      ) : righe.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nessun cliente con piano editoriale"
          description="Compaiono qui i clienti attivi per cui è prevista la programmazione dei contenuti."
        />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-pw-border/50">
            {ordinate.map((r) => {
              const s = stato(r.copertoFino, oggi);
              return (
                <div key={r.clientId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-pw-text truncate">{r.nome}</p>
                    <p className="text-xs text-pw-text-muted mt-0.5">
                      {r.copertoFino
                        ? `Programmato fino al ${dataEstesa(r.copertoFino)}`
                        : 'Nessuna data di copertura'}
                    </p>
                  </div>

                  <Badge tone={s.tono} dot>{s.testo}</Badge>

                  {puoModificare && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={r.copertoFino ?? ''}
                        onChange={(e) => void salva(r.clientId, e.target.value)}
                        disabled={salvataggio === r.clientId}
                        aria-label={`Programmato fino al, per ${r.nome}`}
                        className="px-2.5 py-1.5 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs outline-none focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 disabled:opacity-50"
                      />
                      {salvataggio === r.clientId && (
                        <Loader2 size={14} className="animate-spin text-pw-text-dim" aria-hidden="true" />
                      )}
                      {salvato === r.clientId && (
                        <Check size={14} className="text-green-500" aria-label="Salvato" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
