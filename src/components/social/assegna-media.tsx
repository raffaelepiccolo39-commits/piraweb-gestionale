'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError, reportUnknown } from '@/lib/report-error';
import { SOCIAL_MEDIA_BUCKET, buildMediaPath, resolveMediaUrls, isVideoPath, VIDEO_MIME, MAX_FILE_MB } from '@/lib/social-media';
import { preparaImmagine, mb } from '@/lib/image-resize';
import type { Client } from '@/types/database';
import { Film, Loader2, Plus, Check, Images } from 'lucide-react';

/**
 * Collega i file ai contenuti di un piano editoriale, tutti in una schermata.
 *
 * Nasce da un problema reale: importando un PED, i reel arrivano con il
 * fotogramma di copertina preso dal PDF, mentre il video vero è un file a
 * parte. Aprire dodici contenuti uno per uno per attaccarne otto è il tipo
 * di lavoro che non si fa mai, e il piano resta a metà.
 *
 * Il video si mette PRIMO nell'elenco dei media: nella griglia del cliente
 * la copertina è il primo file, e per un reel deve partire il video, non
 * restare il fermo immagine.
 */

interface PostMinimo {
  id: string;
  title: string;
  formato: 'post' | 'reel' | 'storia' | 'carosello';
  scheduled_at: string | null;
  media_urls: string[];
}

export function AssegnaMedia({ clients }: { clients: Client[] }) {
  const supabase = createClient();
  const toast = useToast();

  const [aperto, setAperto] = useState(false);
  const [cliente, setCliente] = useState('');
  const [posts, setPosts] = useState<PostMinimo[]>([]);
  const [anteprime, setAnteprime] = useState<Record<string, string>>({});
  const [caricando, setCaricando] = useState(false);
  const [attivo, setAttivo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const carica = useCallback(async () => {
    if (!cliente) { setPosts([]); return; }
    const { data, error } = await supabase
      .from('social_posts')
      .select('id, title, formato, scheduled_at, media_urls')
      .eq('client_id', cliente)
      .neq('status', 'published')
      .order('scheduled_at', { ascending: true, nullsFirst: false });

    if (error) reportSupabaseError(error, 'assegna-media-lista', { cliente });
    const righe = (data as PostMinimo[]) || [];
    setPosts(righe);

    const percorsi = righe.flatMap((p) => p.media_urls || []);
    if (percorsi.length) setAnteprime(await resolveMediaUrls(supabase, percorsi));
  }, [cliente, supabase]);

  useEffect(() => { carica(); }, [carica]);

  const allega = async (post: PostMinimo, files: FileList) => {
    setCaricando(true);
    const aggiunti: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|m4v)$/i.test(file.name);
        if (!file.type.startsWith('image/') && !isVideo) {
          toast.error(`${file.name}: servono immagini o video MP4/MOV`);
          continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(`${file.name} pesa ${mb(file.size)}: il massimo è ${MAX_FILE_MB} MB`);
          continue;
        }

        const pronto = isVideo
          ? { file, ridotta: false, originale: file.size, finale: file.size }
          : await preparaImmagine(file);

        const percorso = buildMediaPath(cliente, pronto.file.name);
        const { error } = await supabase.storage
          .from(SOCIAL_MEDIA_BUCKET)
          .upload(percorso, pronto.file, { cacheControl: '3600', upsert: false });

        if (error) {
          reportUnknown(error, 'client', { op: 'assegna-media-upload', percorso });
          toast.error(`Caricamento fallito: ${file.name}`);
          continue;
        }
        aggiunti.push(percorso);
      }

      if (!aggiunti.length) return;

      // Il video va davanti: nella griglia del cliente la copertina è il
      // primo file, e per un reel deve partire il video invece di lasciare
      // il fermo immagine preso dal PDF.
      const video = aggiunti.filter(isVideoPath);
      const resto = aggiunti.filter((p) => !isVideoPath(p));
      const nuovi = [...video, ...resto, ...(post.media_urls || [])];

      const { error } = await supabase
        .from('social_posts')
        .update({ media_urls: nuovi })
        .eq('id', post.id);

      if (error) {
        reportSupabaseError(error, 'assegna-media-salva', { postId: post.id });
        toast.error('File caricato ma non collegato al contenuto');
        return;
      }

      toast.success(`${aggiunti.length === 1 ? 'File collegato' : aggiunti.length + ' file collegati'}`);
      carica();
    } finally {
      setCaricando(false);
      setAttivo(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const senzaMedia = posts.filter((p) => !(p.media_urls || []).length).length;
  const reelSenzaVideo = posts.filter(
    (p) => p.formato === 'reel' && !(p.media_urls || []).some(isVideoPath)
  ).length;

  return (
    <>
      <Button variant="outline" onClick={() => setAperto(true)}>
        <Images size={16} /> Collega media
      </Button>

      <Modal open={aperto} onClose={() => setAperto(false)} title="Collega foto e reel ai contenuti" size="lg">
        <div className="mb-3">
          <Select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            options={[
              { value: '', label: 'Scegli il cliente…' },
              ...clients.map((c) => ({ value: c.id, label: c.company || c.name })),
            ]}
          />
        </div>

        {cliente && posts.length > 0 && (
          <p className="text-xs text-pw-text-dim mb-3">
            {posts.length} contenuti in programma
            {senzaMedia > 0 && <> · <span className="text-amber-500">{senzaMedia} senza file</span></>}
            {reelSenzaVideo > 0 && <> · <span className="text-amber-500">{reelSenzaVideo} reel senza video</span></>}
          </p>
        )}

        <div className="max-h-[55vh] overflow-y-auto space-y-2">
          {posts.map((p) => {
            const primo = (p.media_urls || [])[0];
            const haVideo = (p.media_urls || []).some(isVideoPath);
            const manca = p.formato === 'reel' && !haVideo;

            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-pw-border p-2.5">
                <div className="w-12 h-[60px] shrink-0 rounded-lg overflow-hidden bg-pw-surface-2 flex items-center justify-center">
                  {primo && anteprime[primo] ? (
                    isVideoPath(primo) ? (
                      <video src={anteprime[primo]} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={anteprime[primo]} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <Plus size={16} className="text-pw-text-dim" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-pw-text truncate">{p.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-pw-text-dim">
                      {p.scheduled_at
                        ? new Date(p.scheduled_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
                        : 'senza data'}
                    </span>
                    <span className={`text-[11px] ${p.formato === 'reel' ? 'text-pw-accent' : 'text-pw-text-dim'}`}>
                      {p.formato}
                    </span>
                    {haVideo && (
                      <span className="text-[11px] text-green-500 inline-flex items-center gap-0.5">
                        <Check size={10} /> video
                      </span>
                    )}
                    {manca && (
                      <span className="text-[11px] text-amber-500 inline-flex items-center gap-0.5">
                        <Film size={10} /> manca il video
                      </span>
                    )}
                    {(p.media_urls || []).length > 1 && (
                      <span className="text-[11px] text-pw-text-dim">
                        {(p.media_urls || []).length} file
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant={manca ? 'primary' : 'outline'}
                  onClick={() => { setAttivo(p.id); inputRef.current?.click(); }}
                  loading={caricando && attivo === p.id}
                >
                  {manca ? 'Carica il video' : 'Aggiungi'}
                </Button>
              </div>
            );
          })}

          {cliente && posts.length === 0 && (
            <p className="text-sm text-pw-text-muted text-center py-8">
              Nessun contenuto in programma per questo cliente.
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => {
            const post = posts.find((p) => p.id === attivo);
            if (post && e.target.files?.length) allega(post, e.target.files);
          }}
        />
      </Modal>
    </>
  );
}
