'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { BarChart3, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * L'andamento del profilo visto dal cliente.
 *
 * I dati sono le righe mensili caricate dal team: le viste semestrale e
 * annuale non sono numeri a parte, sono somme e medie delle stesse righe.
 * Un solo posto da riempire, tre modi di leggerlo — e nessun rischio che
 * il totale dell'anno smetta di corrispondere ai mesi che lo compongono.
 */

interface Mese {
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

type Periodo = 1 | 6 | 12;

const PERIODI: { valore: Periodo; etichetta: string }[] = [
  { valore: 1, etichetta: 'Ultimo mese' },
  { valore: 6, etichetta: '6 mesi' },
  { valore: 12, etichetta: 'Anno' },
];

const num = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('it-IT');

const meseCorto = (m: string) =>
  new Date(m + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short' });

export default function PortaleReportPage() {
  const supabase = createClient();
  const [righe, setRighe] = useState<Mese[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>(6);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_metrics')
      .select('mese, follower, nuovi_follower, copertura, visualizzazioni, interazioni, visite_profilo, click_sito, nota')
      .order('mese', { ascending: true });

    if (error) reportSupabaseError(error, 'portale-report', {});
    setRighe((data as Mese[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  // Il periodo scelto e quello precedente della stessa durata: il confronto
  // ha senso solo fra due intervalli lunghi uguali.
  //
  // "confrontabile" non c'era, e la regola scritta qui sopra non veniva
  // applicata: con sette mesi caricati e il periodo su sei, il precedente era
  // UN mese solo e la variazione usciva a +500%. Numeri gonfiati proprio dove
  // dimostriamo il nostro valore — il posto peggiore per sbagliare.
  const { attuale, precedente, confrontabile } = useMemo(() => {
    const n = periodo;
    const prima = righe.slice(-n * 2, -n);
    return {
      attuale: righe.slice(-n),
      precedente: prima,
      confrontabile: righe.length >= n * 2 && prima.length === n,
    };
  }, [righe, periodo]);

  const somma = (dati: Mese[], campo: keyof Mese) =>
    dati.reduce((s, r) => s + (Number(r[campo]) || 0), 0);

  // I follower sono una fotografia, non un flusso: si prende l'ultimo valore
  // del periodo, non la somma dei mesi — sommarli darebbe un numero assurdo.
  const followerFine = (dati: Mese[]) => {
    const conValore = dati.filter((r) => r.follower !== null);
    return conValore.length ? conValore[conValore.length - 1].follower! : null;
  };

  const variazione = (ora: number | null, prima: number | null) => {
    // Senza abbastanza storia non si confronta: meglio nessuna percentuale
    // che una percentuale falsa.
    if (!confrontabile) return null;
    if (ora === null || prima === null || prima === 0) return null;
    return ((ora - prima) / prima) * 100;
  };

  const dati = [
    {
      etichetta: 'Follower',
      valore: followerFine(attuale),
      delta: variazione(followerFine(attuale), followerFine(precedente)),
      nota: 'a fine periodo',
    },
    {
      etichetta: 'Nuovi follower',
      valore: somma(attuale, 'nuovi_follower') || null,
      delta: variazione(somma(attuale, 'nuovi_follower'), somma(precedente, 'nuovi_follower')),
      nota: 'nel periodo',
    },
    {
      etichetta: 'Copertura',
      valore: somma(attuale, 'copertura') || null,
      delta: variazione(somma(attuale, 'copertura'), somma(precedente, 'copertura')),
      nota: 'persone raggiunte',
    },
    {
      etichetta: 'Interazioni',
      valore: somma(attuale, 'interazioni') || null,
      delta: variazione(somma(attuale, 'interazioni'), somma(precedente, 'interazioni')),
      nota: 'like, commenti, salvataggi',
    },
  ];

  const grafico = attuale.map((r) => ({
    mese: meseCorto(r.mese),
    Copertura: r.copertura || 0,
    Interazioni: r.interazioni || 0,
  }));

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (righe.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <BarChart3 size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Report in arrivo</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Ogni mese carichiamo qui i numeri del tuo profilo: quanto è cresciuto,
          quante persone hai raggiunto e come hanno reagito.
        </p>
      </div>
    );
  }

  const ultimo = righe[righe.length - 1];

  return (
    <>
      <h2 className="text-lg font-semibold text-pw-text mb-1">Come sta andando</h2>
      <p className="text-sm text-pw-text-muted mb-4">
        Dati aggiornati a <span className="capitalize">
          {new Date(ultimo.mese + 'T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
        </span>
      </p>

      {/* Periodo: gli stessi dati letti a tre distanze diverse */}
      <div className="flex gap-1.5 mb-5">
        {PERIODI.map((p) => (
          <button
            key={p.valore}
            onClick={() => setPeriodo(p.valore)}
            disabled={righe.length < p.valore}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40',
              periodo === p.valore
                ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                : 'border-pw-border text-pw-text-muted'
            )}
          >
            {p.etichetta}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-6">
        {dati.map((d) => (
          <div key={d.etichetta} className="rounded-2xl border border-pw-border bg-pw-surface p-4">
            <p className="text-[11px] uppercase tracking-wider text-pw-text-dim">{d.etichetta}</p>
            <p className="text-2xl font-bold text-pw-text mt-1 tabular-nums">{num(d.valore)}</p>

            <div className="flex items-center gap-1 mt-1">
              {d.delta === null ? (
                <span className="text-[11px] text-pw-text-dim">
                  {confrontabile ? d.nota : 'non ancora confrontabile'}
                </span>
              ) : (
                <>
                  <span className={cn(
                    'inline-flex items-center gap-0.5 text-[11px] font-medium',
                    d.delta > 0 ? 'text-green-600 dark:text-green-500' : d.delta < 0 ? 'text-red-500' : 'text-pw-text-dim'
                  )}>
                    {d.delta > 0 ? <TrendingUp size={11} /> : d.delta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                    {d.delta > 0 ? '+' : ''}{d.delta.toFixed(0)}%
                  </span>
                  <span className="text-[11px] text-pw-text-dim">sul periodo prima</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {grafico.length > 1 && (
        <div className="rounded-2xl border border-pw-border bg-pw-surface p-4 mb-6">
          <p className="text-[11px] uppercase tracking-wider text-pw-text-dim mb-3">Mese per mese</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pw-border)" vertical={false} />
                <XAxis dataKey="mese" tick={{ fontSize: 11, fill: 'var(--pw-text-dim)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--pw-surface)',
                    border: '1px solid var(--pw-border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v) => Number(v ?? 0).toLocaleString('it-IT')}
                />
                <Bar dataKey="Copertura" fill="var(--pw-gold)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Interazioni" fill="var(--pw-navy)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Le note spiegano i picchi: senza, un mese che spicca resta un mistero */}
      {attuale.some((r) => r.nota) && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim mb-2">
            Cosa è successo
          </p>
          <div className="space-y-2">
            {attuale.filter((r) => r.nota).reverse().map((r) => (
              <div key={r.mese} className="rounded-xl border border-pw-border bg-pw-surface p-3">
                <p className="text-xs font-medium text-pw-accent capitalize">
                  {new Date(r.mese + 'T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-pw-text-muted mt-0.5">{r.nota}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
