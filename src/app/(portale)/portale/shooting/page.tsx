'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Camera, Loader2, Check, Clock, X } from 'lucide-react';

/**
 * Il cliente propone una data per il prossimo shooting.
 *
 * Vede quali giorni siamo già impegnati — solo le date, mai con chi o per
 * cosa — sceglie giorno e fascia, e la proposta resta in attesa finché il
 * team non la conferma. Una troupe e un set non si spostano come un
 * appuntamento, quindi non si prenota da solo.
 */

type Fascia = 'mattina' | 'pomeriggio' | 'giornata';

interface Richiesta {
  id: string;
  data_richiesta: string;
  fascia: Fascia;
  nota_cliente: string | null;
  stato: 'proposta' | 'confermata' | 'rifiutata';
  risposta_team: string | null;
}

const FASCE: { valore: Fascia; etichetta: string }[] = [
  { valore: 'mattina', etichetta: 'Mattina' },
  { valore: 'pomeriggio', etichetta: 'Pomeriggio' },
  { valore: 'giornata', etichetta: 'Tutto il giorno' },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function PortaleShootingPage() {
  const supabase = createClient();
  const toast = useToast();

  const [richieste, setRichieste] = useState<Richiesta[]>([]);
  const [occupati, setOccupati] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [scelto, setScelto] = useState<string | null>(null);
  const [fascia, setFascia] = useState<Fascia>('mattina');
  const [nota, setNota] = useState('');
  const [invio, setInvio] = useState(false);

  // I prossimi 45 giorni, esclusi sabato e domenica: uno shooting si fa
  // in settimana, e proporre un sabato porterebbe solo a un rifiuto.
  const giorni = useMemo(() => {
    const out: Date[] = [];
    const oggi = new Date();
    for (let i = 2; i <= 45; i++) {
      const d = new Date(oggi);
      d.setDate(d.getDate() + i);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) out.push(d);
    }
    return out;
  }, []);

  const carica = useCallback(async () => {
    const da = ymd(giorni[0]);
    const a = ymd(giorni[giorni.length - 1]);

    const [req, occ] = await Promise.all([
      supabase
        .from('shooting_requests')
        .select('id, data_richiesta, fascia, nota_cliente, stato, risposta_team')
        .order('created_at', { ascending: false }),
      supabase.rpc('portal_giorni_occupati', { p_da: da, p_a: a }),
    ]);

    if (req.error) reportSupabaseError(req.error, 'portale-shooting-lista', {});
    setRichieste((req.data as Richiesta[]) || []);
    setOccupati(new Set(((occ.data as { giorno: string }[]) || []).map((r) => r.giorno)));
    setLoading(false);
  }, [supabase, giorni]);

  useEffect(() => { carica(); }, [carica]);

  const inAttesa = richieste.find((r) => r.stato === 'proposta');

  const proponi = async () => {
    if (!scelto) { toast.error('Scegli un giorno'); return; }
    setInvio(true);
    const { error } = await supabase.rpc('portal_richiedi_shooting', {
      p_data: scelto,
      p_fascia: fascia,
      p_nota: nota || null,
    });
    setInvio(false);

    if (error) {
      toast.error(error.message.includes('già una proposta')
        ? 'Hai già una proposta in attesa: aspetta la nostra conferma'
        : 'Non è stato possibile inviare la proposta, riprova');
      return;
    }
    toast.success('Proposta inviata: ti confermiamo al più presto');
    setScelto(null); setNota('');
    carica();
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-pw-text mb-1">Prenota lo shooting</h2>
      <p className="text-sm text-pw-text-muted mb-5">
        Scegli il giorno che ti va meglio fra quelli liberi. Ti confermiamo noi.
      </p>

      {/* Lo storico prima del modulo: se c'è una proposta aperta, sapere a
          che punto sta viene prima di poterne fare un'altra. */}
      {richieste.length > 0 && (
        <div className="space-y-2 mb-6">
          {richieste.slice(0, 3).map((r) => (
            <div key={r.id} className="rounded-xl border border-pw-border bg-pw-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-pw-text">
                    {new Date(r.data_richiesta + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs text-pw-text-dim">
                    {FASCE.find((f) => f.valore === r.fascia)?.etichetta}
                  </p>
                </div>
                <span className={cn(
                  'shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium',
                  r.stato === 'confermata' ? 'bg-green-500/10 text-green-500'
                    : r.stato === 'rifiutata' ? 'bg-red-500/10 text-red-500'
                    : 'bg-pw-accent/10 text-pw-accent'
                )}>
                  {r.stato === 'confermata' ? <><Check size={11} /> Confermato</>
                    : r.stato === 'rifiutata' ? <><X size={11} /> Non disponibile</>
                    : <><Clock size={11} /> In attesa</>}
                </span>
              </div>
              {r.risposta_team && (
                <p className="text-xs text-pw-text-muted italic mt-2">«{r.risposta_team}»</p>
              )}
            </div>
          ))}
        </div>
      )}

      {inAttesa ? (
        <p className="text-sm text-pw-text-muted text-center py-6">
          Hai una proposta in attesa di conferma. Ti scriviamo appena l&apos;abbiamo guardata.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-4">
            {giorni.map((d) => {
              const key = ymd(d);
              const occupato = occupati.has(key);
              const attivo = scelto === key;
              return (
                <button
                  key={key}
                  disabled={occupato}
                  onClick={() => setScelto(key)}
                  className={cn(
                    'rounded-xl border p-2 text-center transition-colors',
                    occupato
                      ? 'border-pw-border bg-pw-surface-2 text-pw-text-dim opacity-40 cursor-not-allowed'
                      : attivo
                        ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                        : 'border-pw-border bg-pw-surface text-pw-text hover:border-pw-accent'
                  )}
                >
                  <span className="block text-[10px] uppercase">
                    {d.toLocaleDateString('it-IT', { weekday: 'short' })}
                  </span>
                  <span className="block text-base font-semibold leading-tight">{d.getDate()}</span>
                  <span className="block text-[10px]">
                    {d.toLocaleDateString('it-IT', { month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-pw-text-dim mb-5">
            I giorni in grigio sono già impegnati.
          </p>

          {scelto && (
            <div className="rounded-xl border border-pw-border bg-pw-surface p-4 space-y-3">
              <p className="text-sm font-medium text-pw-text">
                {new Date(scelto + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>

              <div className="flex gap-2">
                {FASCE.map((f) => (
                  <button
                    key={f.valore}
                    onClick={() => setFascia(f.valore)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
                      fascia === f.valore
                        ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                        : 'border-pw-border text-pw-text-muted'
                    )}
                  >
                    {f.etichetta}
                  </button>
                ))}
              </div>

              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={2}
                placeholder="Vuoi dirci qualcosa? (prodotti da fotografare, location…)"
                className="w-full px-3 py-2 rounded-lg bg-pw-surface-2 border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
              />

              <button
                onClick={proponi}
                disabled={invio}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-semibold disabled:opacity-60"
              >
                {invio ? <><Loader2 size={16} className="animate-spin" /> Invio…</> : <><Camera size={16} /> Proponi questa data</>}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
