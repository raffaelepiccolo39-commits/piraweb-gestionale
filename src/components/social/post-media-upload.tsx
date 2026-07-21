'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { reportUnknown } from '@/lib/report-error';
import { SOCIAL_MEDIA_BUCKET, buildMediaPath, resolveMediaUrls, isVideoPath, VIDEO_MIME, MAX_FILE_MB } from '@/lib/social-media';
import { preparaImmagine, mb } from '@/lib/image-resize';
import { ImagePlus, X, Loader2, Play } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

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
  const [videoTroppoGrande, setVideoTroppoGrande] = useState<{ nome: string; peso: string } | null>(null);
  // File caricati in questa sessione: sono gli unici che si possono cancellare
  // davvero dal bucket, perche nessun post salvato li cita ancora.
  const caricatiOra = useRef<Set<string>>(new Set());

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
          if (isVideo) {
            // Un messaggio che dice solo "troppo grande" lascia l'utente
            // fermo. Un export tipico da telecamera o da ProRes pesa
            // centinaia di MB; Instagram lo ricomprime comunque a una
            // frazione, quindi la ricetta di export è la risposta vera.
            setVideoTroppoGrande({ nome: file.name, peso: mb(file.size) });
          } else {
            toast.error(`${file.name} supera i ${MAX_FILE_MB} MB`);
          }
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
        caricatiOra.current.add(path);
      }

      if (added.length > 0) {
        onChange([...value, ...added]);
        toast.success(added.length === 1 ? 'File caricato' : `${added.length} file caricati`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async (path: string) => {
    onChange(value.filter((p) => p !== path));

    // Dal bucket si cancella SOLO se il file è stato caricato adesso, in
    // questa sessione di modifica, e quindi nessun post salvato lo cita.
    //
    // Prima si cancellava sempre, subito: chi toglieva un'immagine e poi
    // annullava la modifica si ritrovava il post che puntava a un file
    // ormai distrutto, e nella griglia del cliente compariva un riquadro
    // vuoto. È successo davvero.
    //
    // Per i file già salvati si toglie solo il riferimento. Resta un file
    // inutilizzato nel bucket — costa un po' di spazio, ma è recuperabile,
    // mentre un file cancellato per errore no.
    if (caricatiOra.current.has(path)) {
      caricatiOra.current.delete(path);
      await supabase.storage.from(SOCIAL_MEDIA_BUCKET).remove([path]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-pw-text mb-1.5">Foto e reel</label>

      <div className="flex flex-wrap gap-2">
        {value.map((path) => (
          <div key={path} className="relative w-[68px] h-[85px] rounded-lg overflow-hidden border border-pw-border bg-pw-surface-2">
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
          className="w-[68px] h-[85px] rounded-lg border-2 border-dashed border-pw-border flex flex-col items-center justify-center gap-1 text-pw-text-dim hover:border-pw-accent hover:text-pw-accent transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          <span className="text-[10px]">{uploading ? 'Carico…' : 'Aggiungi'}</span>
        </button>
      </div>

      {/* Instagram accetta al massimo 10 elementi in un carosello. Non blocco
          il caricamento — magari servono per scegliere, o sono per un'altra
          piattaforma — ma va detto adesso, non quando la pubblicazione viene
          rifiutata. */}
      {value.length > 10 && (
        <p className="text-[11px] text-amber-500 mt-2">
          {value.length} contenuti: Instagram ne accetta al massimo 10 per carosello.
          Gli altri vanno in un post separato.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Modal
        open={!!videoTroppoGrande}
        onClose={() => setVideoTroppoGrande(null)}
        title="Il video è troppo pesante"
        size="md"
      >
        {videoTroppoGrande && (
          <div className="space-y-4 text-sm">
            <p className="text-pw-text-muted">
              <strong className="text-pw-text">{videoTroppoGrande.nome}</strong> pesa{' '}
              {videoTroppoGrande.peso}, il massimo è {MAX_FILE_MB} MB.
            </p>
            <p className="text-pw-text-muted">
              Non è una perdita di qualità: Instagram ricomprime comunque ogni video a circa
              questa dimensione. Un reel esportato bene pesa 15-30 MB e sul telefono è
              indistinguibile dall&apos;originale.
            </p>

            <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-4">
              <p className="font-medium text-pw-text mb-2">Come esportarlo</p>
              <ul className="space-y-1.5 text-pw-text-muted text-[13px]">
                <li>· Formato <strong className="text-pw-text">MP4</strong>, codifica H.264 — non ProRes, non il MOV che esce dalla telecamera</li>
                <li>· Risoluzione <strong className="text-pw-text">1080×1920</strong>, verticale 9:16</li>
                <li>· Bitrate <strong className="text-pw-text">8-10 Mbps</strong></li>
                <li>· Premiere: preset «H.264», poi abbassa il bitrate a 10</li>
                <li>· CapCut o telefono: esporta a 1080p, non 4K</li>
              </ul>
            </div>

            <p className="text-[12px] text-pw-text-dim">
              Se servono davvero i file originali pesanti si può passare al piano Supabase a pagamento.
            </p>
          </div>
        )}
      </Modal>

      <p className="text-[11px] text-pw-text-dim mt-1.5">
        Foto e reel (MP4 o MOV). Le anteprime sono in 4:5 verticale, lo stesso taglio con cui le
        vede il cliente e con cui escono su Instagram. Il primo file fa da copertina.
        Le foto grandi vengono rimpicciolite da sole; i video no, quindi devono stare
        sotto i {MAX_FILE_MB} MB.
      </p>
    </div>
  );
}
