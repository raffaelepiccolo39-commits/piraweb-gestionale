'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { reportUnknown } from '@/lib/report-error';
import { SOCIAL_MEDIA_BUCKET, buildMediaPath, resolveMediaUrls, isVideoPath, VIDEO_MIME, MAX_FILE_MB } from '@/lib/social-media';
import { preparaImmagine, mb } from '@/lib/image-resize';
import { ImagePlus, X, Loader2, Play } from 'lucide-react';

/**
 * Caricamento immagini di un post social.
 *
 * Senza questo la griglia del portale mostra riquadri col titolo: è il pezzo
 * che trasforma il piano editoriale in qualcosa che somiglia a un profilo.
 *
 * Il file va nella cartella del cliente, perché è il percorso a decidere chi
 * potrà vederlo (policy dello storage su current_client_id()).
 */


export function PostMediaUpload({
  clientId,
  value,
  onChange,
}: {
  clientId: string;
  value: string[];
  onChange: (paths: string[]) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // I percorsi da soli non si possono mostrare: servono link firmati.
  useEffect(() => {
    if (value.length === 0) { setPreviews({}); return; }
    let cancelled = false;
    resolveMediaUrls(supabase, value).then((map) => { if (!cancelled) setPreviews(map); });
    return () => { cancelled = true; };
  }, [value, supabase]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!clientId) { toast.error('Scegli prima il cliente: la foto va nella sua cartella'); return; }

    setUploading(true);
    const added: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const isVideo = VIDEO_MIME.includes(file.type) || /\.(mp4|mov|m4v)$/i.test(file.name);
        if (!file.type.startsWith('image/') && !isVideo) {
          toast.error(`${file.name}: servono immagini o video MP4/MOV`);
          continue;
        }

        // I video non si possono rimpicciolire nel browser, quindi il tetto
        // del piano Supabase (50 MB) e' invalicabile: meglio dirlo qui che
        // far fallire il caricamento a meta strada.
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(
            isVideo
              ? `${file.name} pesa ${mb(file.size)}: il massimo è ${MAX_FILE_MB} MB. Accorcia il reel o esportalo più leggero.`
              : `${file.name} supera i ${MAX_FILE_MB} MB`
          );
          continue;
        }

        // Solo le immagini vengono ridotte: Instagram rifiuta oltre 8 MB, e
        // queste foto le scarica il cliente dal telefono.
        const esito = isVideo
          ? { file, originale: file.size, finale: file.size, ridotta: false }
          : await preparaImmagine(file);
        if (esito.ridotta) {
          toast.info(`${file.name}: ${mb(esito.originale)} → ${mb(esito.finale)}`);
        }

        const path = buildMediaPath(clientId, esito.file.name);
        const { error } = await supabase.storage
          .from(SOCIAL_MEDIA_BUCKET)
          .upload(path, esito.file, { cacheControl: '3600', upsert: false });

        if (error) {
          reportUnknown(error, 'client', { op: 'social-media-upload', path });
          toast.error(`Caricamento fallito: ${file.name}`);
          continue;
        }
        added.push(path);
      }

      if (added.length > 0) {
        onChange([...value, ...added]);
        toast.success(added.length === 1 ? 'Immagine caricata' : `${added.length} immagini caricate`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async (path: string) => {
    // Si toglie dal post e dal bucket: un file orfano non lo vedrebbe più
    // nessuno ma continuerebbe a occupare spazio.
    onChange(value.filter((p) => p !== path));
    if (!path.startsWith('http')) {
      await supabase.storage.from(SOCIAL_MEDIA_BUCKET).remove([path]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-pw-text mb-1.5">Immagini</label>

      <div className="flex flex-wrap gap-2">
        {value.map((path) => (
          <div key={path} className="relative w-20 h-20 rounded-lg overflow-hidden border border-pw-border bg-pw-surface-2">
            {previews[path] ? (
              isVideoPath(path) ? (
                <div className="relative w-full h-full">
                  <video src={previews[path]} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <Play size={16} className="text-white" fill="white" />
                  </span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- link firmato a scadenza, fuori dalla config di next/image
                <img src={previews[path]} alt="" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-pw-text-dim">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
            <button
              type="button"
              onClick={() => handleRemove(path)}
              className="absolute top-0.5 right-0.5 p-1 rounded-md bg-black/60 text-white hover:bg-black/80"
              aria-label="Rimuovi immagine"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-20 h-20 rounded-lg border-2 border-dashed border-pw-border flex flex-col items-center justify-center gap-1 text-pw-text-dim hover:border-pw-accent hover:text-pw-accent transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          <span className="text-[10px]">{uploading ? 'Carico…' : 'Aggiungi'}</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-[11px] text-pw-text-dim mt-1.5">
        Foto e reel (MP4 o MOV). Il primo file fa da copertina nella griglia del cliente.
        Le foto grandi vengono rimpicciolite da sole; i video no, quindi devono stare
        sotto i {MAX_FILE_MB} MB.
      </p>
    </div>
  );
}
