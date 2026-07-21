'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { usePortal } from '@/components/portale/portal-gate';
import { Avviso } from '@/components/portale/avviso';
import { reportSupabaseError } from '@/lib/report-error';
import { resolveMediaUrls, coverDi, isVideoPath } from '@/lib/social-media';
import { cn } from '@/lib/utils';
import { conta, type PostPiano, type FiltroPiano } from '@/lib/piano-editoriale';
import {
  Palette, FileText, Lightbulb, Camera, ChevronRight, Loader2,
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

/**
 * Quando esce il contenuto, per esteso.
 *
 * Con il giorno della settimana: "giovedì 14 agosto alle 18:00" dice qualcosa
 * in più di "14/08 18:00" a chi sta guardando il piano.
 */
function quandoEsce(iso: string | null): string {
  if (!iso) return 'Data ancora da fissare';
  const d = new Date(iso);
  const giorno = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `${giorno} alle ${ora}`;
}

/** Come si legge una fascia oraria, per il cliente. */
const FASCE: Record<string, string> = {
  mattina: 'Mattina',
  pomeriggio: 'Pomeriggio',
  giornata: 'Tutto il giorno',
};

interface Shooting {
  id: string;
  data_richiesta: string;
  fascia: 'mattina' | 'pomeriggio' | 'giornata';
  stato: 'proposta' | 'confermata' | 'rifiutata';
}

interface Contenuto {
  id: string;
  title: string;
  caption: string | null;
  media_urls: string[] | null;
  formato: string;
  client_approval: string;
  scheduled_at: string | null;
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
  const [materiali, setMateriali] = useState({ moodboard: 0, script: 0, ideaVideo: 0 });
  const materialiAttesa = materiali.moodboard + materiali.script + materiali.ideaVideo;
  const [scaduti, setScaduti] = useState<{ quanti: number; totale: number; piuVecchia: string | null }>({ quanti: 0, totale: 0, piuVecchia: null });
  const [shootingAperto, setShootingAperto] = useState(false);
  const [prossimoShooting, setProssimoShooting] = useState<Shooting | null>(null);
  const [scadenzaPiano, setScadenzaPiano] = useState<string | null>(null);
  const [conte, setConte] = useState({ daApprovare: 0, inProgramma: 0, postati: 0 });

  // Il prossimo contenuto in uscita: la query ne chiede uno solo.
  const prossimo = contenuti[0] ?? null;
  const percorsoProssimo = prossimo ? coverDi(prossimo.media_urls) : null;
  const anteprimaProssimo = percorsoProssimo ? media[percorsoProssimo] : undefined;

  const carica = useCallback(async () => {
    const oggi = new Date().toISOString().slice(0, 10);

    const [post, materiali, rate, shooting, serve, perConte] = await Promise.all([
      // Il PROSSIMO contenuto, uno solo: da adesso in avanti, il piu' vicino.
      // Serve anche la didascalia, che prima non veniva chiesta perche' la
      // griglia mostrava solo le anteprime.
      supabase.from('social_posts')
        .select('id, title, caption, media_urls, formato, client_approval, scheduled_at')
        .in('status', ['ready', 'scheduled'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1),
      // Il TIPO serve: tre avvisi distinti in home, uno per moodboard, uno
      // per gli script e uno per le idee video.
      supabase.from('client_materials')
        .select('type')
        .eq('client_approval', 'pending'),
      supabase.from('client_payments')
        .select('amount, due_date, is_paid')
        .eq('is_paid', false)
        .lt('due_date', oggi),
      // Servono le righe, non il conteggio: la home mostra la data di quello
      // fissato. Solo da oggi in avanti — uno shooting fatto a maggio non e'
      // il "prossimo".
      supabase.from('shooting_requests')
        .select('id, data_richiesta, fascia, stato')
        .in('stato', ['proposta', 'confermata'])
        .gte('data_richiesta', oggi)
        .order('data_richiesta', { ascending: true }),
      // Il cliente non puo leggere la copertura del piano (e giusto cosi):
      // la funzione restituisce solo la data del suo.
      supabase.rpc('portal_scadenza_piano'),
      // Per le tre conte servono TUTTI i contenuti, non i sei dell'anteprima
      // qui sopra. Si chiedono i soli tre campi che decidono la vista, e si
      // contano con le stesse funzioni che la pagina usa per filtrare: cosi'
      // il numero e l'elenco non possono dire cose diverse.
      supabase.from('social_posts').select('status, client_approval, scheduled_at'),
    ]);

    if (post.error) reportSupabaseError(post.error, 'portale-home', {});

    const righe = (post.data as Contenuto[]) || [];
    setContenuti(righe);
    const inAttesa = (materiali.data as { type: string }[]) || [];
    const perTipo = (t: string) => inAttesa.filter((m) => m.type === t).length;
    setMateriali({
      moodboard: perTipo('moodboard'),
      script: perTipo('script'),
      ideaVideo: perTipo('idea_video'),
    });
    const richieste = (shooting.data as Shooting[]) || [];
    setShootingAperto(richieste.some((r) => r.stato === 'proposta'));
    // Il prossimo e' il primo confermato; se non ce n'e', la proposta piu'
    // vicina, cosi' il cliente vede che la sua richiesta e' in mano a qualcuno.
    setProssimoShooting(
      richieste.find((r) => r.stato === 'confermata')
      ?? richieste.find((r) => r.stato === 'proposta')
      ?? null
    );
    setScadenzaPiano((serve.data as string | null) ?? null);
    const tutti = (perConte.data as PostPiano[]) || [];
    setConte({
      daApprovare: conta(tutti, 'da-approvare'),
      inProgramma: conta(tutti, 'in-programma'),
      postati: conta(tutti, 'postati'),
    });

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

  // I numeri del piano editoriale: quanto aspetta lui, quanto aspetta di
  // uscire, quanto e' gia' uscito questo mese. Moodboard, script e shooting
  // erano scorciatoie a un menu, non informazioni: stanno nel menu.
  const MATERIALI = [
    {
      href: '/portale/piano-scatti', icona: Palette, etichetta: 'Moodboard',
      quanti: materiali.moodboard, unoSolo: 'Un moodboard da approvare', tanti: 'moodboard da approvare',
    },
    {
      href: '/portale/script', icona: FileText, etichetta: 'Script video',
      quanti: materiali.script, unoSolo: 'Uno script da approvare', tanti: 'script da approvare',
    },
    {
      href: '/portale/idee-video', icona: Lightbulb, etichetta: 'Idee video',
      quanti: materiali.ideaVideo, unoSolo: "Un'idea video da approvare", tanti: 'idee video da approvare',
    },
  ];

  const CONTENUTI: { chiave: FiltroPiano; label: string; valore: number; evidenzia: boolean }[] = [
    { chiave: 'da-approvare', label: 'Da approvare', valore: conte.daApprovare, evidenzia: conte.daApprovare > 0 },
    { chiave: 'in-programma', label: 'In programma', valore: conte.inProgramma, evidenzia: false },
    { chiave: 'postati', label: 'Postati', valore: conte.postati, evidenzia: false },
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
          {/* Niente sottotitolo: diceva quante cose aspettano una risposta,
              ma da quando c'e' la campanella quel mestiere lo fa lei — e lo fa
              meglio, perche' si puo' aprire. */}
        </div>
      </div>

      {/* ── Piano editoriale del mese: i tre numeri ──
          Dentro un riquadro, come le altre schede della pagina: era l'unico
          blocco appoggiato sullo sfondo e sembrava fuori posto. I tre numeri
          perdono il bordo singolo e si dividono con una riga sottile —
          riquadri dentro il riquadro sarebbero due contenitori per una cosa
          sola. */}
      <div className="rounded-2xl border border-pw-border bg-pw-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim">
          Piano editoriale
        </p>
        {/* first-letter e non capitalize: "Luglio 2026", non "Luglio 2026"
            con ogni parola maiuscola. */}
        <h2 className="text-base font-semibold text-pw-text first-letter:uppercase">
          {new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
        </h2>

        <div className="grid grid-cols-3 mt-3 pt-3 border-t border-pw-border divide-x divide-pw-border">
          {CONTENUTI.map((c) => (
            <Link
              key={c.chiave}
              // Ognuno porta alla PROPRIA vista: tre numeri diversi che
              // aprivano lo stesso elenco erano tre bugie sotto forma di link.
              href={`/portale/contenuti?filtro=${c.chiave}`}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg active:bg-pw-surface-2 transition-colors"
            >
              <span className={cn(
                'text-2xl font-bold tabular-nums leading-none',
                // Solo "da approvare" si accende, e solo se c'e' qualcosa: e'
                // l'unica delle tre che chiede di fare qualcosa. Colorarle
                // tutte vorrebbe dire non evidenziare niente.
                c.evidenzia ? 'text-pw-accent' : 'text-pw-text'
              )}>
                {c.valore}
              </span>
              <span className="text-[11px] font-medium text-pw-text-muted text-center leading-tight mt-1">
                {c.label}
              </span>
            </Link>
          ))}
        </div>

        {/* ── Il prossimo in uscita, nello stesso riquadro ──
            Non e' un'altra sezione: sono due modi di guardare lo stesso piano
            del mese — quanti contenuti ci sono, e qual e' il prossimo. Separati
            sembravano due argomenti. */}
        <div className="flex items-baseline justify-between mt-4 pt-3 border-t border-pw-border">
          <h3 className="text-sm font-semibold text-pw-text">Il prossimo contenuto</h3>
          <Link href="/portale/contenuti" className="text-xs font-medium text-pw-accent inline-flex items-center gap-0.5">
            Vedi tutto <ChevronRight size={14} />
          </Link>
        </div>

        {!prossimo ? (
          <p className="text-sm text-pw-text-muted py-5 text-center">
            Ancora nessun contenuto programmato.
          </p>
        ) : (
          <Link
            // Al CONTENUTO, non all'elenco: la scheda parla di questo qui, e
            // farla atterrare sulla griglia obbligava a ritrovarlo a mano.
            href={`/portale/contenuti?post=${prossimo.id}`}
            className="flex gap-3 mt-2.5 -mx-1 px-1 py-1 rounded-xl active:bg-pw-surface-2 transition-colors"
          >
            {/* A sinistra: la foto piccola e sotto il copy. La foto a tutta
                larghezza si mangiava mezza schermata per un contenuto solo. */}
            <div className="min-w-0 flex-1">
              <div className="relative w-28 aspect-[4/5] rounded-xl overflow-hidden bg-pw-surface-2">
                {anteprimaProssimo ? (
                  percorsoProssimo && isVideoPath(percorsoProssimo) ? (
                    <video src={anteprimaProssimo} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={anteprimaProssimo} alt="" className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2 text-center">
                    <span className="text-[10px] text-pw-text-dim line-clamp-4">{prossimo.title}</span>
                  </div>
                )}

                {prossimo.formato === 'reel' && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Play size={20} className="text-white drop-shadow-lg" fill="white" />
                  </span>
                )}
              </div>

              {prossimo.caption ? (
                // Il copy intero renderebbe la home lunghissima: qui se ne
                // legge l'inizio, il resto sta nel dettaglio del contenuto.
                <p className="mt-2.5 text-sm text-pw-text-muted whitespace-pre-wrap line-clamp-4">
                  {prossimo.caption}
                </p>
              ) : (
                <p className="mt-2.5 text-sm text-pw-text-muted line-clamp-4">{prossimo.title}</p>
              )}
            </div>

            {/* A destra, stretta: quando esce. Larghezza fissa, cosi' una data
                lunga non ruba spazio al copy. */}
            <div className="w-[5.5rem] shrink-0 border-l border-pw-border pl-3 flex flex-col">
              <span className={cn(
                'self-start px-1.5 py-0.5 rounded text-[9px] font-semibold text-white',
                prossimo.client_approval === 'approved' ? 'bg-green-500'
                  : prossimo.client_approval === 'changes_requested' ? 'bg-amber-500'
                  : 'bg-blue-500'
              )}>
                {prossimo.client_approval === 'approved' ? 'Approvato'
                  : prossimo.client_approval === 'changes_requested' ? 'Modifiche'
                  : 'Da approvare'}
              </span>

              {prossimo.scheduled_at ? (
                <>
                  <span className="mt-2 text-[11px] text-pw-text-dim first-letter:uppercase leading-tight">
                    {new Date(prossimo.scheduled_at).toLocaleDateString('it-IT', { weekday: 'long' })}
                  </span>
                  <span className="text-sm font-semibold text-pw-text leading-tight">
                    {new Date(prossimo.scheduled_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                  </span>
                  <span className="mt-1 text-sm font-bold text-pw-accent tabular-nums">
                    {new Date(prossimo.scheduled_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </>
              ) : (
                <span className="mt-2 text-[11px] text-pw-text-dim leading-tight">Data da fissare</span>
              )}

              <ChevronRight size={15} className="mt-auto self-end text-pw-text-dim" />
            </div>
          </Link>
        )}
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

      {/* ── Prossimo shooting ──
          Compare sempre, anche quando non c'e' niente in programma: "nessuno
          shooting fissato" e' un'informazione, e sapere che non c'e' nulla
          all'orizzonte e' meta' del motivo per cui uno guarda questa riga. */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim mb-2">
          Prossimo shooting
        </p>
        <Link
          href="/portale/shooting"
          className="flex items-center gap-3 rounded-2xl border border-pw-border bg-pw-surface p-4 active:bg-pw-surface-2 transition-colors"
        >
          <span className={cn(
            'shrink-0 flex h-10 w-10 items-center justify-center rounded-xl',
            prossimoShooting ? 'bg-pw-accent/10 text-pw-accent' : 'bg-pw-surface-2 text-pw-text-dim'
          )}>
            <Camera size={18} />
          </span>

          <span className="min-w-0 flex-1">
            {prossimoShooting ? (
              <>
                {/* first-letter e non capitalize: in italiano il mese resta
                    minuscolo, "Domenica 2 Agosto" non si scrive. */}
                <span className="block text-sm font-semibold text-pw-text first-letter:uppercase">
                  {new Date(`${prossimoShooting.data_richiesta}T12:00:00`).toLocaleDateString('it-IT', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </span>
                <span className="block text-xs text-pw-text-dim mt-0.5">
                  {FASCE[prossimoShooting.fascia]}
                  {prossimoShooting.stato === 'confermata'
                    ? ' — confermato'
                    : ' — in attesa di conferma'}
                </span>
              </>
            ) : (
              <>
                <span className="block text-sm font-medium text-pw-text-muted">
                  Nessuno shooting fissato
                </span>
                <span className="block text-xs text-pw-text-dim mt-0.5">
                  {serveShooting
                    ? 'Il piano sta per finire: proponi una data'
                    : 'Al momento non ce n’è bisogno'}
                </span>
              </>
            )}
          </span>

          <ChevronRight size={16} className="shrink-0 text-pw-text-dim" />
        </Link>
      </div>

      {/* ── Materiali da approvare: un avviso per tipo ──
          Tre voci separate e non "3 documenti da guardare": per il cliente un
          moodboard e uno script sono cose diverse, e sapere QUALE lo aspetta
          decide se aprirlo adesso o stasera. Restano finche' non risponde. */}
      {MATERIALI.map((m) => m.quanti > 0 && (
        <Avviso
          key={m.href}
          href={m.href}
          icona={m.icona}
          tono="oro"
          etichetta={m.etichetta}
          valore={m.quanti === 1 ? m.unoSolo : `${m.quanti} ${m.tanti}`}
          dettaglio="Aspetta la tua approvazione"
        />
      ))}

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


      {daApprovare === 0 && materialiAttesa === 0 && (
        <p className="text-xs text-pw-text-dim text-center inline-flex items-center justify-center gap-1.5 w-full">
          <Check size={13} className="text-green-500" /> Hai risposto a tutto, grazie
        </p>
      )}
    </div>
  );
}
