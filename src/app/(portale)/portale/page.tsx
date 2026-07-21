'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { reportSupabaseError } from '@/lib/report-error';
import { resolveMediaUrls, isVideoPath } from '@/lib/social-media';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { ImageIcon, Loader2, CalendarDays, AtSign, Globe, Share2, Tv, MessageCircle, Hash, Check, MessageSquareWarning, Play } from 'lucide-react';

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

function formatDate(iso: string | null): string {
  if (!iso) return 'Data da definire';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PortaleContenutiPage() {
  const supabase = createClient();
  const [posts, setPosts] = useState<PortalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PortalPost | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [askChanges, setAskChanges] = useState(false);
  const toast = useToast();

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
      .select('id, title, caption, platforms, status, scheduled_at, published_at, media_urls, hashtags, client_approval, client_comment')
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
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-pw-text">Il tuo piano editoriale</h2>
        <p className="text-sm text-pw-text-muted">
          {posts.length} {posts.length === 1 ? 'contenuto' : 'contenuti'} — tocca per leggere la didascalia
        </p>
      </div>

      {/* Griglia stile profilo: 3 colonne, riquadri quadrati, spazio minimo */}
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {posts.map((post) => {
          const coverPath = post.media_urls?.[0];
          const cover = coverPath ? media[coverPath] : undefined;
          return (
            <button
              key={post.id}
              onClick={() => setSelected(post)}
              className="relative aspect-square overflow-hidden rounded-sm sm:rounded-lg bg-pw-surface-2 group"
            >
              {cover ? (
                coverPath && isVideoPath(coverPath) ? (
                  <>
                    <video src={cover} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    {/* Il simbolo del play: come su Instagram, distingue un reel da una foto */}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Play size={22} className="text-white drop-shadow-lg" fill="white" />
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- URL esterni variabili: evita la config domini di next/image
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

              {post.status !== 'published' && (
                <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/60 text-white">
                  {STATUS_LABEL[post.status] || post.status}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || ''} size="md">
        {selected && (
          <div className="space-y-4">
            {selected.media_urls?.[0] && media[selected.media_urls[0]] && (
              isVideoPath(selected.media_urls[0]) ? (
                <video
                  src={media[selected.media_urls[0]]}
                  className="w-full rounded-xl bg-black"
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media[selected.media_urls[0]]} alt={selected.title} className="w-full rounded-xl" />
              )
            )}

            <div className="flex items-center gap-3 text-sm text-pw-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={15} />
                {formatDate(selected.published_at || selected.scheduled_at)}
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
          </div>
        )}
      </Modal>
    </>
  );
}
