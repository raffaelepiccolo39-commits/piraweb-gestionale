'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { usePortal } from '@/components/portale/portal-gate';
import { Avviso } from '@/components/portale/avviso';
import { reportSupabaseError } from '@/lib/report-error';
import { resolveMediaUrls, coverDi, isVideoPath } from '@/lib/social-media';
import { cn } from '@/lib/utils';
import {
  LayoutGrid, Palette, FileText, Camera, ChevronRight, Loader2,
  AlertTriangle, Play, Check,
} from 'lucide-react';

/**
 * La home del portale: un riepilogo, non una griglia.
 *
 * Prima si atterrava dritti sui contenuti, e tutto il resto — script,
 * piani scatti, pagamenti, shooting da fissare — esisteva solo per chi
 * apriva il menu. Il cliente entra per sapere una cosa: che cosa deve fare
 * oggi. Le sezioni compaiono solo quando hanno qualcosa da dire, così nei
 * periodi tranquilli la pagina resta corta.
 */

/**
 * Importi come si scrivono in fattura: simbolo davanti e punto delle migliaia.
 *
 * useGrouping esplicito perche' l'italiano, da CLDR, il separatore sotto le
 * cinque cifre non lo mette: 1000 diventerebbe "1000,00" invece di "1.000,00".
 * Corretto per la lingua, sbagliato per dei soldi mostrati a un cliente.
 */
export const euro = (n: number) =>
  `€ ${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Number(n))}`;

interface Contenuto {
  id: string;
  title: string;
  media_urls: string[] | null;
  formato: string;
  client_approval: string;
}

/**
 * Di quale mensilità si tratta.
 *
 * "Una rata" non diceva nulla: chi legge vuole sapere quale mese deve
 * saldare. Il mese è quello della scadenza, che è come viene emessa.
 *
 * Con più arretrati si indica la più vecchia, non il mese in corso: se uno è
 * indietro da aprile, scrivere "mensilità di luglio" gli nasconderebbe da
 * quanto tempo è fermo — e a noi la parte piu' importante del discorso.
 */
function dettaglioScaduti(quanti: number, piuVecchia: string | null): string {
  if (!piuVecchia) return quanti === 1 ? 'Una rata' : `${quanti} rate`;

  const data = new Date(`${piuVecchia.slice(0, 10)}T12:00:00`);
  const mese = data.toLocaleDateString('it-IT', { month: 'long' });
  // L'anno solo se non e' questo: su un arretrato di due mesi sarebbe rumore,
  // su uno dell'anno scorso e' l'informazione principale.
  const scadenza = data.toLocaleDateString('it-IT',
    data.getFullYear() === new Date().getFullYear()
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' });

  return quanti === 1
    ? `Mensilità di ${mese} — scaduta il ${scadenza}`
    : `${quanti} mensilità — la più vecchia scaduta il ${scadenza}`;
}

export default function PortaleHome() {
  const supabase = createClient();
  const { fullName, clientName } = usePortal();

  const [loading, setLoading] = useState(true);
  const [contenuti, setContenuti] = useState<Contenuto[]>([]);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [materialiAttesa, setMaterialiAttesa] = useState(0);
  const [scaduti, setScaduti] = useState<{ quanti: number; totale: number; piuVecchia: string | null }>({ quanti: 0, totale: 0, piuVecchia: null });
  const [shootingAperto, setShootingAperto] = useState(false);
  const [scadenzaPiano, setScadenzaPiano] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const oggi = new Date().toISOString().slice(0, 10);

    const [post, materiali, rate, shooting, serve] = await Promise.all([
      supabase.from('social_posts')
        .select('id, title, media_urls, formato, client_approval')
        .in('status', ['ready', 'scheduled'])
        .order('scheduled_at', { ascending: true, nullsFirst: false })
        .limit(6),
      supabase.from('client_materials')
        .select('id', { count: 'exact', head: true })
        .eq('client_approval', 'pending'),
      supabase.from('client_payments')
        .select('amount, due_date, is_paid')
        .eq('is_paid', false)
        .lt('due_date', oggi),
      supabase.from('shooting_requests')
        .select('id', { count: 'exact', head: true })
        .eq('stato', 'proposta'),
      // Il cliente non puo leggere la copertura del piano (e giusto cosi):
      // la funzione restituisce solo la data del suo.
      supabase.rpc('portal_scadenza_piano'),
    ]);

    if (post.error) reportSupabaseError(post.error, 'portale-home', {});

    const righe = (post.data as Contenuto[]) || [];
    setContenuti(righe);
    setMaterialiAttesa(materiali.count ?? 0);
    setShootingAperto((shooting.count ?? 0) > 0);
    setScadenzaPiano((serve.data as string | null) ?? null);

    const nonPagate = (rate.data as { amount: number; due_date: string }[]) || [];
    setScaduti({
      quanti: nonPagate.length,
      totale: nonPagate.reduce((s, r) => s + Number(r.amount), 0),
      // La piu' vecchia: con piu' rate arretrate e' quella che dice davvero
      // da quando si e' indietro.
      piuVecchia: nonPagate.length
        ? nonPagate.map((r) => r.due_date).sort()[0]
        : null,
    });

    const percorsi = righe.flatMap((p) => p.media_urls || []);
    if (percorsi.length) setMedia(await resolveMediaUrls(supabase, percorsi));

    setLoading(false);
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  const nome = fullName?.split(' ')[0] || '';
  const ora = new Date().getHours();
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const daApprovare = contenuti.filter((c) => c.client_approval === 'pending').length;

  // Giorni che mancano alla fine del piano. La soglia e la stessa dell'email
  // che gli mandiamo (15): due numeri diversi creerebbero il caso in cui
  // riceve l'avviso ma nel portale non trova nulla, o viceversa.
  const giorniAllaFine = scadenzaPiano
    ? Math.ceil((new Date(scadenzaPiano + 'T12:00:00').getTime() - Date.now()) / 86400000)
    : null;
  const pianoInScadenza = giorniAllaFine !== null && giorniAllaFine <= 15;
  const serveShooting = pianoInScadenza || shootingAperto;

  // Lo shooting compare solo quando serve davvero: piano in scadenza o
  // proposta in attesa. Il resto dell'anno sarebbe una voce che non porta
  // da nessuna parte, e le scorciatoie perdono senso se una e sempre finta.
  const SCORCIATOIE = [
    { href: '/portale/contenuti', label: 'Contenuti da approvare', icona: LayoutGrid },
    { href: '/portale/piano-scatti', label: 'Moodboard', icona: Palette },
    { href: '/portale/script', label: 'Script', icona: FileText },
    ...(serveShooting ? [{ href: '/portale/shooting', label: 'Shooting', icona: Camera }] : []),
  ];

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Saluto ── */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--pw-navy)] p-5 text-white">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--pw-gold)]/10" aria-hidden="true" />
        <div className="absolute -right-2 top-10 h-16 w-16 rounded-full bg-[var(--pw-gold)]/5" aria-hidden="true" />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--pw-gold)]">
            {saluto}{nome ? `, ${nome}` : ''}
          </p>
          <h1 className="mt-1.5 text-xl font-bold leading-snug">
            Benvenuto nell’area dedicata a {clientName}
          </h1>
          <p className="mt-2 text-sm text-white/75">
            {daApprovare + materialiAttesa > 0
              ? 'Ecco cosa aspetta un tuo parere'
              : 'Non c’è nulla in sospeso, tutto a posto'}
          </p>
        </div>
      </div>

      {/* ── Scorciatoie ── */}
      <div className={cn('grid gap-2', SCORCIATOIE.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        {SCORCIATOIE.map((s) => {
          const Icona = s.icona;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-pw-border bg-pw-surface p-3 active:bg-pw-surface-2 transition-colors"
            >
              <Icona size={20} className="text-pw-accent" />
              <span className="text-[10px] font-medium text-pw-text-muted text-center leading-tight">{s.label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── Cose urgenti: compaiono solo se lo sono davvero ── */}
      {scaduti.quanti > 0 && (
        <Avviso
          href="/portale/pagamenti"
          icona={AlertTriangle}
          tono="rosso"
          etichetta={scaduti.quanti === 1 ? 'Pagamento scaduto' : 'Pagamenti scaduti'}
          valore={`${euro(scaduti.totale)} da saldare`}
          dettaglio={dettaglioScaduti(scaduti.quanti, scaduti.piuVecchia)}
        />
      )}

      {/* Il piano sta per finire: senza nuovo materiale il profilo resta
          scoperto, ed e' la scadenza che costa di piu ignorare. */}
      {pianoInScadenza && !shootingAperto && (
        <Avviso
          href="/portale/shooting"
          icona={Camera}
          tono={giorniAllaFine !== null && giorniAllaFine <= 5 ? 'rosso' : 'ambra'}
          etichetta="Piano editoriale in scadenza"
          valore={
            giorniAllaFine !== null && giorniAllaFine <= 0
              ? 'I contenuti sono finiti'
              : `Ancora ${giorniAllaFine} ${giorniAllaFine === 1 ? 'giorno' : 'giorni'} di contenuti`
          }
          dettaglio={`Fino al ${new Date(scadenzaPiano! + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} — fissiamo lo shooting`}
        />
      )}

      {materialiAttesa > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim">Da approvare</p>
          </div>
          <Link
            href="/portale/piano-scatti"
            className="flex items-center gap-3 rounded-2xl border border-pw-border bg-pw-surface p-4"
          >
            <div className="w-10 h-10 rounded-xl bg-pw-accent/10 flex items-center justify-center shrink-0">
              <Palette size={18} className="text-pw-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-pw-text">
                {materialiAttesa === 1 ? 'Un documento' : `${materialiAttesa} documenti`} da guardare
              </p>
              <p className="text-xs text-pw-text-muted">Piani scatti, script e idee video</p>
            </div>
            <ChevronRight size={18} className="text-pw-text-dim shrink-0" />
          </Link>
        </div>
      )}

      {shootingAperto && (
        <Link
          href="/portale/shooting"
          className="flex items-center gap-3 rounded-2xl border border-pw-accent/30 bg-pw-accent/5 p-4"
        >
          <Camera size={20} className="text-pw-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-pw-text">Shooting in attesa di conferma</p>
            <p className="text-xs text-pw-text-muted">Ti confermiamo al più presto la data che hai proposto</p>
          </div>
          <ChevronRight size={18} className="text-pw-text-dim shrink-0" />
        </Link>
      )}

      {/* ── Anteprima del piano ── */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim">Piano editoriale</p>
            <h2 className="text-base font-semibold text-pw-text">I prossimi contenuti</h2>
          </div>
          <Link href="/portale/contenuti" className="text-xs font-medium text-pw-accent inline-flex items-center gap-0.5">
            Vedi tutto <ChevronRight size={14} />
          </Link>
        </div>

        {contenuti.length === 0 ? (
          <p className="text-sm text-pw-text-muted py-6 text-center rounded-2xl border border-pw-border">
            Ancora nessun contenuto programmato.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {contenuti.map((c) => {
              const percorso = coverDi(c.media_urls);
              const url = percorso ? media[percorso] : undefined;
              return (
                <Link
                  key={c.id}
                  href="/portale/contenuti"
                  className="relative aspect-[4/5] rounded-lg overflow-hidden bg-pw-surface-2"
                >
                  {url ? (
                    percorso && isVideoPath(percorso) ? (
                      <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-1.5 text-center">
                      <span className="text-[9px] text-pw-text-dim line-clamp-3">{c.title}</span>
                    </div>
                  )}

                  {c.formato === 'reel' && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play size={16} className="text-white drop-shadow" fill="white" />
                    </span>
                  )}
                  <span className={cn(
                    'absolute top-1 right-1 w-2 h-2 rounded-full',
                    c.client_approval === 'approved' ? 'bg-green-500'
                      : c.client_approval === 'changes_requested' ? 'bg-amber-500'
                      : 'bg-blue-500'
                  )} />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {daApprovare === 0 && materialiAttesa === 0 && (
        <p className="text-xs text-pw-text-dim text-center inline-flex items-center justify-center gap-1.5 w-full">
          <Check size={13} className="text-green-500" /> Hai risposto a tutto, grazie
        </p>
      )}
    </div>
  );
}
