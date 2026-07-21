'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { useToast } from '@/components/ui/toast';
import { usePortal } from '@/components/portale/portal-gate';
import { cn } from '@/lib/utils';
import { Loader2, Send, Paperclip, X, FileIcon, MessageCircle } from 'lucide-react';

/**
 * La conversazione col team.
 *
 * È la risposta al buco più grande del portale: fin qui il cliente poteva
 * solo approvare, e per qualsiasi altra cosa doveva uscire e aprire WhatsApp.
 * Il materiale finiva sul telefono di chi rispondeva per primo e la
 * conversazione non era ritrovabile da nessun altro in agenzia.
 *
 * Non è una chat in tempo reale e non finge di esserlo: il tono è quello di
 * un messaggio che riceve risposta in giornata, non di una finestra in cui
 * qualcuno sta digitando. Promettere una presenza che non c'è è peggio che
 * non avere il canale.
 */

interface Messaggio {
  id: string;
  autore: 'cliente' | 'team';
  testo: string | null;
  allegati: string[];
  created_at: string;
  portal_user: { full_name: string | null } | null;
  profilo: { full_name: string | null } | null;
}

const MAX_FILE = 25 * 1024 * 1024;

const quando = (iso: string) => {
  const d = new Date(iso);
  const oggi = new Date();
  const stessoGiorno = d.toDateString() === oggi.toDateString();
  return stessoGiorno
    ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

export default function PortaleMessaggiPage() {
  const supabase = createClient();
  const toast = useToast();
  const { clientId } = usePortal();

  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [testo, setTesto] = useState('');
  const [file, setFile] = useState<File[]>([]);
  const [invio, setInvio] = useState(false);
  const [anteprime, setAnteprime] = useState<Record<string, string>>({});
  const fondo = useRef<HTMLDivElement>(null);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_messages')
      .select('id, autore, testo, allegati, created_at, portal_user:client_portal_users(full_name), profilo:profiles(full_name)')
      .order('created_at', { ascending: true });

    if (error) reportSupabaseError(error, 'portale-messaggi', {});
    const righe = (data as unknown as Messaggio[]) || [];
    setMessaggi(righe);
    setLoading(false);

    // Link firmati per gli allegati, una chiamata per tutti.
    const percorsi = righe.flatMap((m) => m.allegati || []);
    if (percorsi.length) {
      const { data: firmati } = await supabase.storage.from('inbox').createSignedUrls(percorsi, 3600);
      const mappa: Record<string, string> = {};
      for (const f of firmati || []) {
        if (f.path && f.signedUrl) mappa[f.path] = f.signedUrl;
      }
      setAnteprime(mappa);
    }

    // Il team ha risposto: da qui in poi risulta letto.
    await supabase.rpc('portal_segna_letto');
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' });
  }, [messaggi.length]);

  const aggiungiFile = (scelti: FileList | null) => {
    if (!scelti) return;
    const buoni: File[] = [];
    for (const f of Array.from(scelti)) {
      if (f.size > MAX_FILE) {
        toast.error(`${f.name} supera i 25 MB. Mandacelo con un link.`);
        continue;
      }
      buoni.push(f);
    }
    setFile((p) => [...p, ...buoni]);
  };

  const invia = async () => {
    if (!testo.trim() && file.length === 0) return;
    if (!clientId) return;

    setInvio(true);
    try {
      // Prima i file, poi la riga: se un caricamento fallisce non resta un
      // messaggio che promette un allegato che non c'è.
      const percorsi: string[] = [];
      let peso = 0;

      for (const f of file) {
        const nome = `${clientId}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, '_')}`;
        const { error } = await supabase.storage.from('inbox').upload(nome, f);
        if (error) {
          reportSupabaseError(error, 'portale-messaggi-upload', { nome });
          toast.error(`Non sono riuscito a caricare ${f.name}`);
          return;
        }
        percorsi.push(nome);
        peso += f.size;
      }

      const { error } = await supabase.rpc('portal_scrivi', {
        p_testo: testo.trim() || null,
        p_allegati: percorsi,
        p_peso: peso,
      });

      if (error) {
        reportSupabaseError(error, 'portale-messaggi-invio', {});
        // I messaggi della funzione sono scritti per essere letti dal cliente
        // (lo spazio esaurito, per esempio): si mostrano com'è.
        toast.error(error.message || 'Non sono riuscito a inviare il messaggio');
        return;
      }

      setTesto('');
      setFile([]);
      carica();

      // Il team non ha notifiche push: senza questa chiamata un messaggio
      // resterebbe lì finché qualcuno non apre la scheda del cliente.
      fetch('/api/portal/messaggio-inviato', { method: 'POST' }).catch(() => {});
    } finally {
      setInvio(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col min-h-[60vh]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-pw-text">Scrivici</h2>
        <p className="text-sm text-pw-text-muted">
          Domande, foto, materiale: qui resta tutto in un posto solo. Ti rispondiamo in giornata.
        </p>
      </div>

      <div className="flex-1 space-y-3 mb-4">
        {messaggi.length === 0 && (
          <div className="text-center py-12 px-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-3">
              <MessageCircle size={24} className="text-pw-accent" />
            </div>
            <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
              Non ci siamo ancora scritti. Puoi mandarci una foto del negozio, un&apos;idea,
              o dirci quando sei chiuso: lo teniamo da conto per il piano.
            </p>
          </div>
        )}

        {messaggi.map((m) => {
          const mio = m.autore === 'cliente';
          const chi = mio
            ? m.portal_user?.full_name
            : m.profilo?.full_name;
          return (
            <div key={m.id} className={cn('flex', mio ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5',
                  mio
                    ? 'bg-pw-accent/10 border border-pw-accent/20'
                    : 'bg-pw-surface border border-pw-border'
                )}
              >
                {!mio && (
                  <p className="text-[11px] font-medium text-pw-accent mb-0.5">
                    {chi || 'Pira Web'}
                  </p>
                )}

                {m.testo && (
                  <p className="text-sm text-pw-text whitespace-pre-wrap break-words">{m.testo}</p>
                )}

                {(m.allegati || []).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.allegati.map((a) => {
                      const url = anteprime[a];
                      const nome = a.split('/').pop() || 'allegato';
                      const immagine = /\.(jpe?g|png|webp|gif|heic)$/i.test(a);
                      return immagine && url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={a} src={url} alt={nome} className="rounded-xl max-h-56 w-auto" />
                      ) : (
                        <a
                          key={a}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-pw-accent hover:underline"
                        >
                          <FileIcon size={13} /> {nome.replace(/^\d+-/, '')}
                        </a>
                      );
                    })}
                  </div>
                )}

                <p className="text-[10px] text-pw-text-dim mt-1">{quando(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={fondo} />
      </div>

      {/* Composizione */}
      <div className="sticky bottom-0 bg-pw-bg pt-2 pb-[env(safe-area-inset-bottom)]">
        {file.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {file.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-pw-surface-2 px-2 py-1 text-xs text-pw-text-muted">
                {f.name}
                <button onClick={() => setFile(file.filter((_, j) => j !== i))} aria-label="Togli">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-pw-border bg-pw-surface p-2">
          <label className="shrink-0 p-2 rounded-xl text-pw-text-dim hover:bg-pw-surface-2 cursor-pointer" title="Allega">
            <Paperclip size={18} />
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { aggiungiFile(e.target.files); e.target.value = ''; }}
            />
          </label>

          <textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            rows={1}
            placeholder="Scrivi un messaggio…"
            className="flex-1 bg-transparent text-sm text-pw-text placeholder:text-pw-text-dim resize-none py-2 max-h-32 focus:outline-none"
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />

          <button
            onClick={invia}
            disabled={invio || (!testo.trim() && file.length === 0)}
            className="shrink-0 p-2.5 rounded-xl bg-pw-accent text-[#0A263A] disabled:opacity-40 transition-opacity"
            aria-label="Invia"
          >
            {invio ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}
