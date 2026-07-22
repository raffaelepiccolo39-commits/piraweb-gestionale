'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Camera, Loader2, Check, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';

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

  /**
   * Il pannello per scegliere la fascia e inviare.
   *
   * Su telefono nasce SOTTO il calendario, quindi fuori dallo schermo: il
   * cliente toccava il giorno, lo vedeva colorarsi, non vedeva comparire
   * nient'altro e chiudeva la pagina. La proposta non partiva mai, senza
   * nemmeno un errore — e da noi non arrivava niente.
   */
  const pannello = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scelto) return;
    // Un attimo dopo il disegno, altrimenti si scorre verso un elemento che
    // ancora non c'e'.
    const t = setTimeout(
      () => pannello.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80,
    );
    return () => clearTimeout(t);
  }, [scelto]);
  const [fascia, setFascia] = useState<Fascia>('mattina');
  const [nota, setNota] = useState('');
  const [invio, setInvio] = useState(false);

  // Cambiando giorno, la fascia scelta prima potrebbe non essere piu' libera.
  // Si sposta da sola sulla prima disponibile, invece di lasciare selezionata
  // una mezza giornata che il team dovrebbe poi rifiutare.
  useEffect(() => {
    if (!scelto) return;
    const libera = (f: Fascia) => f === 'giornata'
      ? !occupati.has(`${scelto}|mattina`) && !occupati.has(`${scelto}|pomeriggio`)
      : !occupati.has(`${scelto}|${f}`);
    if (!libera(fascia)) {
      const prima = (['mattina', 'pomeriggio', 'giornata'] as Fascia[]).find(libera);
      if (prima) setFascia(prima);
    }
  }, [scelto, occupati, fascia]);


  /**
   * La finestra in cui si può proporre: da dopodomani a 45 giorni.
   *
   * Non domani: una data proposta per domani arriva quasi sempre tardi, e
   * costringe a un no. Non oltre 45 giorni: più in là il calendario non è
   * ancora deciso e prometteremmo una disponibilità che non abbiamo.
   */
  const { primo, ultimo } = useMemo(() => {
    const a = new Date(); a.setHours(0, 0, 0, 0); a.setDate(a.getDate() + 2);
    const b = new Date(); b.setHours(0, 0, 0, 0); b.setDate(b.getDate() + 45);
    return { primo: a, ultimo: b };
  }, []);

  // Il mese mostrato adesso. Si parte da quello del primo giorno proponibile.
  const [meseVisto, setMeseVisto] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  /**
   * Le caselle del mese, allineate alla settimana che comincia di LUNEDÌ.
   *
   * Le caselle vuote all'inizio servono a far cadere ogni giorno sotto la sua
   * colonna: senza, il 3 agosto finirebbe sotto "lunedì" solo per caso.
   */
  const caselle = useMemo(() => {
    const anno = meseVisto.getFullYear();
    const mese = meseVisto.getMonth();
    const primoDelMese = new Date(anno, mese, 1);
    // getDay(): 0 = domenica. Con la settimana che parte da lunedì, domenica
    // vale 6 e lunedì 0.
    const sfasamento = (primoDelMese.getDay() + 6) % 7;
    const quantiGiorni = new Date(anno, mese + 1, 0).getDate();

    const out: (Date | null)[] = Array(sfasamento).fill(null);
    for (let g = 1; g <= quantiGiorni; g++) out.push(new Date(anno, mese, g));
    return out;
  }, [meseVisto]);

  /** Un giorno si può proporre solo se è nella finestra e non è nel weekend. */
  const proponibile = useCallback((d: Date) => {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false;
    return d >= primo && d <= ultimo;
  }, [primo, ultimo]);

  // Si può andare avanti e indietro solo dentro la finestra: mesi vuoti non
  // servono a niente.
  const meseIndietro = new Date(meseVisto.getFullYear(), meseVisto.getMonth() - 1, 1);
  const meseAvanti = new Date(meseVisto.getFullYear(), meseVisto.getMonth() + 1, 1);
  const puoIndietro = meseIndietro >= new Date(primo.getFullYear(), primo.getMonth(), 1);
  const puoAvanti = meseAvanti <= new Date(ultimo.getFullYear(), ultimo.getMonth(), 1);

  const carica = useCallback(async () => {
    const da = ymd(primo);
    const a = ymd(ultimo);

    const [req, occ] = await Promise.all([
      supabase
        .from('shooting_requests')
        .select('id, data_richiesta, fascia, nota_cliente, stato, risposta_team')
        .order('created_at', { ascending: false }),
      supabase.rpc('portal_fasce_occupate', { p_da: da, p_a: a }),
    ]);

    if (req.error) reportSupabaseError(req.error, 'portale-shooting-lista', {});
    setRichieste((req.data as Richiesta[]) || []);
    // Chiave "giorno|fascia": un giorno con la sola mattina impegnata resta
    // proponibile per il pomeriggio.
    setOccupati(new Set(
      ((occ.data as { giorno: string; fascia: string }[]) || [])
        .map((r) => `${r.giorno}|${r.fascia}`)
    ));
    setLoading(false);
  }, [supabase, primo, ultimo]);

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
                  r.stato === 'confermata' ? 'bg-green-500/10 text-green-600 dark:text-green-500'
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
          {/* Calendario del mese, settimana da lunedì a domenica. */}
          <div className="rounded-2xl border border-pw-border bg-pw-surface p-3 mb-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMeseVisto(meseIndietro)}
                disabled={!puoIndietro}
                aria-label="Mese precedente"
                className="p-2 rounded-lg text-pw-text-dim disabled:opacity-30 hover:bg-pw-surface-2"
              >
                <ChevronLeft size={18} />
              </button>
              <p className="text-sm font-semibold text-pw-text first-letter:uppercase">
                {meseVisto.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
              </p>
              <button
                onClick={() => setMeseVisto(meseAvanti)}
                disabled={!puoAvanti}
                aria-label="Mese successivo"
                className="p-2 rounded-lg text-pw-text-dim disabled:opacity-30 hover:bg-pw-surface-2"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((g, i) => (
                <span key={i} className="text-center text-[10px] font-semibold text-pw-text-dim py-1">
                  {g}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {caselle.map((d, i) => {
                if (!d) return <span key={`vuota-${i}`} />;

                const key = ymd(d);
                const mattinaPresa = occupati.has(`${key}|mattina`);
                const pomeriggioPreso = occupati.has(`${key}|pomeriggio`);
                const pieno = mattinaPresa && pomeriggioPreso;
                const mezzo = (mattinaPresa || pomeriggioPreso) && !pieno;
                const fuori = !proponibile(d);
                const attivo = scelto === key;

                return (
                  <button
                    key={key}
                    disabled={fuori || pieno}
                    onClick={() => setScelto(key)}
                    className={cn(
                      'relative aspect-square rounded-lg text-sm transition-colors flex items-center justify-center',
                      fuori || pieno
                        ? 'text-pw-text-dim opacity-35 cursor-not-allowed'
                        : attivo
                          ? 'bg-pw-accent text-[#0A263A] font-bold'
                          : 'text-pw-text hover:bg-pw-surface-2 font-medium'
                    )}
                    title={pieno ? 'Giornata già impegnata' : mezzo ? 'Mezza giornata libera' : undefined}
                  >
                    {d.getDate()}
                    {/* Il puntino avverte che il giorno è libero solo a metà:
                        senza, il cliente lo sceglie e scopre solo dopo che la
                        mattina non c'è. */}
                    {mezzo && !attivo && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-pw-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-pw-text-dim mb-5">
            I giorni in grigio non sono disponibili. Quelli con il puntino
            hanno libera solo mezza giornata.
          </p>

          {scelto && (
            <div ref={pannello} className="rounded-xl border border-pw-border bg-pw-surface p-4 space-y-3">
              <p className="text-sm font-medium text-pw-text">
                {new Date(scelto + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>

              <div className="flex gap-2">
                {FASCE.map((f) => {
                  // 'giornata' richiede entrambe libere; le altre solo la propria.
                  const presa = f.valore === 'giornata'
                    ? occupati.has(`${scelto}|mattina`) || occupati.has(`${scelto}|pomeriggio`)
                    : occupati.has(`${scelto}|${f.valore}`);
                  return (
                  <button
                    key={f.valore}
                    disabled={presa}
                    onClick={() => setFascia(f.valore)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
                      presa
                        ? 'border-pw-border text-pw-text-dim opacity-40 cursor-not-allowed line-through'
                        : fascia === f.valore
                          ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                          : 'border-pw-border text-pw-text-muted'
                    )}
                  >
                    {f.etichetta}
                  </button>
                  );
                })}
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
