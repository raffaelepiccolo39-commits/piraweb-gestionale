'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { reportSupabaseError } from '@/lib/report-error';
import { resolveMediaUrls, isVideoPath, isExternalLink, coverDi } from '@/lib/social-media';
import { useToast } from '@/components/ui/toast';
import { usePortal } from '@/components/portale/portal-gate';
import { LogoCliente } from '@/components/portale/logo-cliente';
import { StoricoRisposte } from '@/components/portale/storico-risposte';
import { cn } from '@/lib/utils';
import { FILTRI, filtroValido } from '@/lib/piano-editoriale';
import { ImageIcon, Loader2, CalendarDays, CheckCheck, AtSign, Globe, Share2, Tv, MessageCircle, Hash, Check, MessageSquareWarning, Play, Copy, ExternalLink, X } from 'lucide-react';

/**
 * Il piano editoriale visto dal cliente: una griglia come il profilo
 * Instagram, in ordine cronologico inverso.
 *
 * Non filtriamo per client_id a mano: ci pensa la RLS
 * ("Il cliente vede il proprio piano editoriale"), che restringe già al
 * proprio cliente e ai soli stati presentabili. Un filtro in più qui
 * darebbe una falsa sensazione di sicurezza sul punto sbagliato.
 */

interface PortalPost {
  id: string;
  title: string;
  caption: string | null;
  platforms: string[];
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  media_urls: string[] | null;
  hashtags: string | null;
  client_approval: 'pending' | 'approved' | 'changes_requested';
  client_comment: string | null;
  formato: 'post' | 'reel' | 'storia' | 'carosello';
}

// Stesse icone e colori del calendario social nel gestionale: il cliente e il
// team devono vedere le stesse cose chiamate allo stesso modo.
const PLATFORM_ICONS: Record<string, typeof Hash> = {
  instagram: AtSign,
  facebook: Globe,
  linkedin: Share2,
  youtube: Tv,
  twitter: MessageCircle,
  tiktok: Hash,
  pinterest: Hash,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'text-pink-500',
  facebook: 'text-blue-600',
  tiktok: 'text-cyan-400',
  linkedin: 'text-blue-700',
  youtube: 'text-red-500',
  twitter: 'text-sky-400',
  pinterest: 'text-red-600',
  other: 'text-pw-text-dim',
};

const STATUS_LABEL: Record<string, string> = {
  ready: 'Pronto',
  scheduled: 'Programmato',
  published: 'Pubblicato',
};

/**
 * Cosa scrivere sul riquadro, dal punto di vista del cliente.
 *
 * Prima compariva lo stato interno ("Pronto"): per noi vuol dire pronto da
 * pubblicare, per lui non vuol dire niente. Al cliente interessa una cosa
 * sola — se deve guardarlo o l'ha gia fatto.
 */
const ETICHETTA_CLIENTE: Record<string, { testo: string; classe: string } | null> = {
  pending: { testo: 'Da approvare', classe: 'bg-blue-500 text-white' },
  approved: { testo: 'Approvato', classe: 'bg-green-500 text-white' },
  changes_requested: { testo: 'Modifiche chieste', classe: 'bg-amber-500 text-white' },
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Data da definire';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * useSearchParams obbliga a un confine di Suspense: senza, la pagina non si
 * puo' generare in anticipo e il build lo segnala.
 */
export default function PortaleContenutiPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>}>
      <Contenuti />
    </Suspense>
  );
}

function Contenuti() {
  const supabase = createClient();
  const [posts, setPosts] = useState<PortalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PortalPost | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [askChanges, setAskChanges] = useState(false);
  const [approvando, setApprovando] = useState<string | null>(null);
  const toast = useToast();
  const { fullName, clientName, clientLogo } = usePortal();

  // Il filtro arriva dalla home. Un valore inventato a mano nell'indirizzo
  // non deve rompere la pagina: filtroValido lo riduce a null e si vede tutto.
  const searchParams = useSearchParams();
  const filtro = filtroValido(searchParams.get('filtro'));
  // L'id di un contenuto da aprire subito: ci arriva dalla home, dalla scheda
  // del prossimo in uscita.
  const daAprire = searchParams.get('post');
  const [giaAperto, setGiaAperto] = useState(false);

  const nome = fullName?.split(' ')[0] || '';
  const ora = new Date().getHours();
  const saluto = ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const daApprovare = posts.filter((p) => p.client_approval === 'pending' && p.status !== 'published').length;

  // La risposta passa da una funzione dedicata: il cliente non ha permessi di
  // scrittura sui post, quindi non può toccare didascalie o date.
  const review = async (approval: 'approved' | 'changes_requested') => {
    if (!selected) return;
    if (approval === 'changes_requested' && !comment.trim()) {
      toast.error('Scrivici cosa vorresti cambiare');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.rpc('portal_review_post', {
      p_post_id: selected.id,
      p_approval: approval,
      p_comment: approval === 'changes_requested' ? comment : null,
    });
    setSending(false);

    if (error || data === false) {
      reportSupabaseError(error ?? new Error('post non aggiornabile'), 'portale-approvazione', { postId: selected.id });
      toast.error('Non è stato possibile inviare la risposta, riprova');
      return;
    }
    toast.success(approval === 'approved' ? 'Contenuto approvato, grazie!' : 'Richiesta inviata, ci mettiamo mano');
    setSelected(null);
    setComment('');
    setAskChanges(false);
    fetchPosts();
  };

  const fetchPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('social_posts')
      .select('id, title, caption, platforms, status, scheduled_at, published_at, media_urls, hashtags, client_approval, client_comment, formato')
      .order('scheduled_at', { ascending: false, nullsFirst: false });

    if (error) reportSupabaseError(error, 'portale-contenuti', {});
    const rows = (data as PortalPost[]) || [];
    setPosts(rows);
    setLoading(false);

    // I percorsi da soli non si mostrano: una sola chiamata per tutti i file.
    const paths = rows.flatMap((p) => p.media_urls || []);
    if (paths.length > 0) setMedia(await resolveMediaUrls(supabase, paths));
  }, [supabase]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  /**
   * Apre da solo il contenuto indicato nell'indirizzo.
   *
   * Una volta sola: senza il segnaposto, chiudendo la finestra il riquadro si
   * riaprirebbe da capo — l'indirizzo non cambia — e non si riuscirebbe piu'
   * a uscirne. Se l'id non corrisponde a niente (contenuto rimosso, link
   * vecchio) non succede nulla e si vede la griglia.
   */
  useEffect(() => {
    if (!daAprire || giaAperto || posts.length === 0) return;
    const trovato = posts.find((p) => p.id === daAprire);
    if (trovato) setSelected(trovato);
    setGiaAperto(true);
  }, [daAprire, giaAperto, posts]);

  /**
   * I contenuti da mostrare, secondo il filtro chiesto dalla home.
   *
   * Le regole vengono da lib/piano-editoriale, le stesse che producono i
   * numeri: se stessero scritte anche qui, prima o poi direbbero cose diverse
   * e il cliente troverebbe quattro contenuti dove il numero ne prometteva tre.
   */
  const visibili = useMemo(
    () => (filtro ? posts.filter((p) => FILTRI[filtro].vale(p)) : posts),
    [posts, filtro]
  );

  /**
   * I contenuti raggruppati per mese di programmazione.
   *
   * Un piano editoriale si ragiona a mesi: senza il raggruppamento la
   * griglia e un flusso continuo in cui il cliente non capisce dove finisce
   * agosto e comincia settembre — e "approva tutto" diventa un si alla
   * cieca su periodi diversi.
   */
  const perMese = useMemo(() => {
    const gruppi = new Map<string, PortalPost[]>();
    for (const p of visibili) {
      const chiave = p.scheduled_at ? p.scheduled_at.slice(0, 7) : 'senza-data';
      if (!gruppi.has(chiave)) gruppi.set(chiave, []);
      gruppi.get(chiave)!.push(p);
    }
    return [...gruppi.entries()];
  }, [visibili]);

  /** Approva in blocco i contenuti in attesa di un mese. */
  const approvaMese = async (chiave: string, quanti: number) => {
    const nome = chiave === 'senza-data'
      ? 'senza data'
      : new Date(chiave + '-01T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

    if (!confirm(`Approvare ${quanti} ${quanti === 1 ? 'contenuto' : 'contenuti'} di ${nome}?\n\nQuelli su cui hai gia chiesto modifiche restano come sono.`)) return;

    setApprovando(chiave);
    const { data, error } = await supabase.rpc('portal_approva_mese', {
      p_mese: chiave === 'senza-data' ? null : `${chiave}-01`,
    });
    setApprovando(null);

    if (error) {
      reportSupabaseError(error, 'portale-approva-mese', { mese: chiave });
      toast.error('Non e stato possibile approvare, riprova');
      return;
    }
    toast.success(`${data} ${data === 1 ? 'contenuto approvato' : 'contenuti approvati'}, grazie!`);
    fetchPosts();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-pw-text-dim">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <ImageIcon size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Ancora nessun contenuto</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Qui vedrai i post che abbiamo programmato per te, come se fosse il tuo profilo.
          Ti avvisiamo appena il primo piano editoriale è pronto.
        </p>
      </div>
    );
  }

  return (
    <>

      {/* Hero card: stesso linguaggio della home del gestionale (navy + oro,
          cerchi decorativi), preso dalle reference Kidville. Qui pero' dice
          al cliente l'unica cosa che gli serve sapere entrando: se c'e
          qualcosa che aspetta una sua risposta. */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--pw-navy)] p-5 text-white mb-5">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--pw-gold)]/10" aria-hidden="true" />
        <div className="absolute -right-2 top-10 h-16 w-16 rounded-full bg-[var(--pw-gold)]/5" aria-hidden="true" />
        <div className="relative flex items-start gap-3.5">
          {/* Logo del cliente su fondo bianco: molti loghi sono scuri e sul
              navy sparirebbero. Se manca, si ripiega sull'iniziale. */}
          <div className="shrink-0 w-16 h-16 rounded-xl bg-white flex items-center justify-center overflow-hidden p-2">
            <LogoCliente url={clientLogo} nome={clientName} className="max-w-full max-h-full object-contain" />
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--pw-gold)]">
              {saluto}{nome ? `, ${nome}` : ''}
            </p>
            {/* Formula neutra: il portale lo apre chi vuole il cliente, e
                sbagliare il genere di chi legge fa un pessimo effetto. */}
            <h1 className="mt-1 text-xl font-bold leading-tight">
              Ti diamo il benvenuto nella tua dashboard
            </h1>
          </div>
        </div>
        <p className="relative mt-3 text-sm text-white/75">
          {daApprovare > 0
            ? <><strong className="font-semibold text-white">{daApprovare}</strong> {daApprovare === 1 ? 'contenuto aspetta' : 'contenuti aspettano'} una tua risposta</>
            : `${posts.length} ${posts.length === 1 ? 'contenuto' : 'contenuti'} — tutto approvato, grazie`}
        </p>
      </div>

      {/* Quale vista si sta guardando, e come tornare a tutto. Senza, chi
          arriva dalla home vede meno contenuti di quelli che sa di avere e
          pensa che ne siano spariti. */}
      {filtro && (
        <div className="flex items-center justify-between gap-3 mb-4 rounded-xl border border-pw-accent/30 bg-pw-accent/5 px-3.5 py-2.5">
          <p className="text-sm text-pw-text">
            <span className="font-semibold">{FILTRI[filtro].etichetta}</span>
            <span className="text-pw-text-dim"> · {visibili.length} {visibili.length === 1 ? 'contenuto' : 'contenuti'}</span>
          </p>
          <Link
            href="/portale/contenuti"
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-pw-accent"
          >
            <X size={13} /> Vedi tutto
          </Link>
        </div>
      )}

      {filtro && visibili.length === 0 && (
        <p className="py-12 text-center text-sm text-pw-text-muted">
          {FILTRI[filtro].vuoto}
        </p>
      )}

      {/* Un blocco per mese: il piano editoriale si ragiona a mesi, e
          l'approvazione in blocco deve valere su un periodo preciso. */}
      {perMese.map(([chiave, gruppo]) => {
        const inAttesa = gruppo.filter((p) => p.client_approval === 'pending' && p.status !== 'published');
        const nomeMese = chiave === 'senza-data'
          ? 'Senza data'
          : new Date(chiave + '-01T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

        return (
          <div key={chiave} className="mb-7 last:mb-0">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim">
                  Mese di riferimento
                </p>
                <h3 className="text-base font-semibold text-pw-text capitalize">{nomeMese}</h3>
              </div>

              {inAttesa.length > 0 && (
                <button
                  onClick={() => approvaMese(chiave, inAttesa.length)}
                  disabled={approvando === chiave}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 text-green-500 text-xs font-semibold disabled:opacity-60"
                >
                  {approvando === chiave
                    ? <><Loader2 size={14} className="animate-spin" /> Approvo…</>
                    : <><CheckCheck size={14} /> Approva tutto ({inAttesa.length})</>}
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {gruppo.map((post) => {
                const coverPath = coverDi(post.media_urls);
                const cover = coverPath ? media[coverPath] : undefined;
                return (
                  <button
                    key={post.id}
                    onClick={() => setSelected(post)}
                    className="relative aspect-[4/5] overflow-hidden rounded-sm sm:rounded-lg bg-pw-surface-2 group"
                  >
                    {cover ? (
                      (coverPath && isVideoPath(coverPath)) || post.formato === 'reel' ? (
                        <>
                          {coverPath && isVideoPath(coverPath) ? (
                            <video src={cover} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center">
                            <Play size={22} className="text-white drop-shadow-lg" fill="white" />
                          </span>
                        </>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover}
                          alt={post.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                        <ImageIcon size={18} className="text-pw-text-dim" />
                        <span className="text-[10px] leading-tight text-pw-text-dim line-clamp-3">{post.title}</span>
                      </div>
                    )}

                    {(post.media_urls || []).filter((m) => !isExternalLink(m)).length > 1 && (
                      <span className="absolute top-1 left-1 text-white drop-shadow">
                        <Copy size={13} />
                      </span>
                    )}

                    {post.status !== 'published' && ETICHETTA_CLIENTE[post.client_approval] && (
                      <span className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${ETICHETTA_CLIENTE[post.client_approval]!.classe}`}>
                        {ETICHETTA_CLIENTE[post.client_approval]!.testo}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} size="md">
        {selected && (
          <div className="space-y-4">
            {/* Tutti i file, non solo il primo: un post puo essere un carosello
                (ne abbiamo visto uno con venti foto) e mostrarne una sola
                significava tenerne diciannove nascoste al cliente.
                Scorrimento orizzontale a scatti, come sfogliare su Instagram. */}
            {(() => {
              const files = (selected.media_urls || []).filter((p) => !isExternalLink(p) && media[p]);
              if (files.length === 0) return null;

              if (files.length === 1) {
                const solo = files[0];
                return isVideoPath(solo) ? (
                  <video src={media[solo]} className="w-full rounded-xl bg-black" controls playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media[solo]} alt={selected.title} className="w-full rounded-xl" />
                );
              }

              return (
                <div>
                  <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 pb-1">
                    {files.map((p) => (
                      <div key={p} className="snap-center shrink-0 w-[85%]">
                        {isVideoPath(p) ? (
                          <video src={media[p]} className="w-full rounded-xl bg-black" controls playsInline preload="metadata" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={media[p]} alt="" className="w-full rounded-xl" />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-pw-text-dim mt-1.5 text-center">
                    {files.length} contenuti — scorri per vederli tutti
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center gap-3 text-sm text-pw-text-muted">
              {/* Si mostra SEMPRE la data programmata, mai quella di
                  pubblicazione effettiva: l'agenzia lavora in anticipo e il
                  cliente ragiona sul calendario concordato. Un post segnato
                  come pubblicato oggi ma previsto per il 24 mostrava il 21,
                  e per il cliente era semplicemente sbagliato.
                  published_at resta un ripiego per i post senza programmazione. */}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={15} />
                {selected.status === 'published' ? 'Pubblicato il ' : 'In programma per il '}
                {formatDate(selected.scheduled_at || selected.published_at)}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                selected.status === 'published'
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-pw-accent/10 text-pw-accent'
              )}>
                {STATUS_LABEL[selected.status] || selected.status}
              </span>
            </div>

            {selected.platforms?.length > 0 && (
              <div className="flex items-center gap-3">
                {selected.platforms.map((p) => {
                  const Icon = PLATFORM_ICONS[p] || Hash;
                  return (
                    <span key={p} className={cn('inline-flex items-center gap-1.5 text-xs', PLATFORM_COLORS[p] || PLATFORM_COLORS.other)}>
                      <Icon size={15} /> {p}
                    </span>
                  );
                })}
              </div>
            )}

            {selected.caption && (
              <p className="text-sm text-pw-text whitespace-pre-wrap leading-relaxed">{selected.caption}</p>
            )}

            {selected.hashtags && (
              <p className="text-sm text-pw-accent break-words">{selected.hashtags}</p>
            )}

            {/* Riferimenti esterni: i video troppo pesanti per stare qui
                vivono su Drive, e si aprono invece di essere incorporati. */}
            {(selected.media_urls || []).filter(isExternalLink).map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-pw-border p-3 text-sm text-pw-accent font-medium hover:bg-pw-surface-2 transition-colors"
              >
                <ExternalLink size={16} /> Guarda il video
              </a>
            ))}

            {/* Approvazione. Sui contenuti già pubblicati non si chiede più
                nulla: sarebbe una domanda a cui non si può più rispondere. */}
            {selected.status !== 'published' && (
              <div className="pt-4 border-t border-pw-border">
                {selected.client_approval === 'approved' ? (
                  <p className="text-sm text-green-500 inline-flex items-center gap-1.5">
                    <Check size={15} /> Hai approvato questo contenuto
                  </p>
                ) : selected.client_approval === 'changes_requested' ? (
                  <div>
                    <p className="text-sm text-amber-500 inline-flex items-center gap-1.5 mb-1">
                      <MessageSquareWarning size={15} /> Hai chiesto delle modifiche
                    </p>
                    {selected.client_comment && (
                      <p className="text-sm text-pw-text-muted italic">«{selected.client_comment}»</p>
                    )}
                  </div>
                ) : askChanges ? (
                  <div className="space-y-3">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="Cosa vorresti cambiare?"
                      className="w-full px-3 py-2 rounded-lg bg-pw-surface-2 border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setAskChanges(false); setComment(''); }}
                        className="px-4 py-2 rounded-lg text-sm text-pw-text-muted"
                      >
                        Annulla
                      </button>
                      <button
                        onClick={() => review('changes_requested')}
                        disabled={sending}
                        className="px-4 py-2 rounded-lg bg-pw-accent text-[#0A263A] text-sm font-medium disabled:opacity-60"
                      >
                        {sending ? 'Invio…' : 'Invia richiesta'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => review('approved')}
                      disabled={sending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-500/10 text-green-500 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-60"
                    >
                      <Check size={16} /> Approva
                    </button>
                    <button
                      onClick={() => setAskChanges(true)}
                      disabled={sending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-pw-border text-pw-text-muted text-sm font-medium hover:bg-pw-surface-2 transition-colors disabled:opacity-60"
                    >
                      <MessageSquareWarning size={16} /> Chiedi modifiche
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* I giri precedenti su questo stesso contenuto: senza, al secondo
                rimando nessuno ricorda cosa era stato chiesto la prima volta. */}
            <StoricoRisposte tabella="social_posts" recordId={selected.id} />
          </div>
        )}
      </Modal>
    </>
  );
}
