'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { ImageIcon, Loader2, CalendarDays, AtSign, Globe, Share2, Tv, MessageCircle, Hash } from 'lucide-react';

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

  const fetchPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('social_posts')
      .select('id, title, caption, platforms, status, scheduled_at, published_at, media_urls, hashtags')
      .order('scheduled_at', { ascending: false, nullsFirst: false });

    if (error) reportSupabaseError(error, 'portale-contenuti', {});
    setPosts((data as PortalPost[]) || []);
    setLoading(false);
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
          const cover = post.media_urls?.[0];
          return (
            <button
              key={post.id}
              onClick={() => setSelected(post)}
              className="relative aspect-square overflow-hidden rounded-sm sm:rounded-lg bg-pw-surface-2 group"
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL esterni variabili: evita la config domini di next/image
                <img
                  src={cover}
                  alt={post.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
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
            {selected.media_urls?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.media_urls[0]} alt={selected.title} className="w-full rounded-xl" />
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
          </div>
        )}
      </Modal>
    </>
  );
}
