'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { MessageCircle, Send, Loader2, FileIcon } from 'lucide-react';

/**
 * La conversazione col cliente, dal lato nostro.
 *
 * Sta nella scheda del cliente e non in una pagina a parte perché è lì che si
 * va quando si lavora su quel cliente: una casella separata sarebbe un posto
 * in più da ricordarsi di aprire, e finirebbe come la campanella.
 */

interface Messaggio {
  id: string;
  autore: 'cliente' | 'team';
  testo: string | null;
  allegati: string[];
  created_at: string;
  letto_dal_team_at: string | null;
  portal_user: { full_name: string | null } | null;
  profilo: { full_name: string | null } | null;
}

const quando = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export function ClientMessages({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();

  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [loading, setLoading] = useState(true);
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const [link, setLink] = useState<Record<string, string>>({});

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_messages')
      .select('id, autore, testo, allegati, created_at, letto_dal_team_at, portal_user:client_portal_users(full_name), profilo:profiles(full_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) reportSupabaseError(error, 'messaggi-cliente-lista', { clientId });
    const righe = (data as unknown as Messaggio[]) || [];
    setMessaggi(righe);
    setLoading(false);

    const percorsi = righe.flatMap((m) => m.allegati || []);
    if (percorsi.length) {
      const { data: firmati } = await supabase.storage.from('inbox').createSignedUrls(percorsi, 3600);
      const mappa: Record<string, string> = {};
      for (const f of firmati || []) if (f.path && f.signedUrl) mappa[f.path] = f.signedUrl;
      setLink(mappa);
    }

    // Aprire la scheda vale come aver letto: il conteggio dei clienti che
    // aspettano deve scendere quando qualcuno guarda davvero, non quando
    // clicca un pulsante in più.
    const daLeggere = righe.filter((m) => m.autore === 'cliente' && !m.letto_dal_team_at);
    if (daLeggere.length) {
      await supabase
        .from('client_messages')
        .update({ letto_dal_team_at: new Date().toISOString() })
        .in('id', daLeggere.map((m) => m.id));
    }
  }, [supabase, clientId]);

  useEffect(() => { carica(); }, [carica]);

  const invia = async () => {
    if (!testo.trim() || !profile) return;
    setInvio(true);
    try {
      const { error } = await supabase.from('client_messages').insert({
        client_id: clientId,
        autore: 'team',
        profile_id: profile.id,
        testo: testo.trim(),
      });

      if (error) {
        reportSupabaseError(error, 'messaggi-cliente-invio', { clientId });
        toast.error('Non sono riuscito a inviare');
        return;
      }

      setTesto('');
      carica();
    } finally {
      setInvio(false);
    }
  };

  const daLeggere = messaggi.filter((m) => m.autore === 'cliente' && !m.letto_dal_team_at).length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle size={18} className="text-pw-accent" />
          <h3 className="text-base font-semibold text-pw-text">Conversazione</h3>
          {daLeggere > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-pw-accent text-[#0A263A] text-[10px] font-bold">
              {daLeggere} da leggere
            </span>
          )}
        </div>
        <p className="text-xs text-pw-text-dim mb-4">
          Quello che il cliente scrive dal portale. Gli arriva nella sua area, non via email.
        </p>

        {loading ? (
          <div className="flex justify-center py-4 text-pw-text-dim"><Loader2 size={16} className="animate-spin" /></div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto mb-3">
            {messaggi.length === 0 && (
              <p className="text-sm text-pw-text-muted py-3 text-center">
                Nessun messaggio. Puoi scrivere tu per primo.
              </p>
            )}
            {messaggi.map((m) => {
              const nostro = m.autore === 'team';
              return (
                <div key={m.id} className={cn('flex', nostro ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[80%] rounded-xl px-3 py-2',
                    nostro ? 'bg-pw-accent/10 border border-pw-accent/20' : 'bg-pw-surface-2 border border-pw-border'
                  )}>
                    <p className="text-[10px] font-medium text-pw-text-dim mb-0.5">
                      {nostro ? (m.profilo?.full_name || 'Team') : (m.portal_user?.full_name || 'Il cliente')}
                      {' · '}{quando(m.created_at)}
                    </p>
                    {m.testo && (
                      <p className="text-sm text-pw-text whitespace-pre-wrap break-words">{m.testo}</p>
                    )}
                    {(m.allegati || []).length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {m.allegati.map((a) => {
                          const url = link[a];
                          const nome = (a.split('/').pop() || 'allegato').replace(/^\d+-/, '');
                          const immagine = /\.(jpe?g|png|webp|gif|heic)$/i.test(a);
                          return immagine && url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={a} src={url} alt={nome} className="rounded-lg max-h-48" />
                          ) : (
                            <a key={a} href={url} target="_blank" rel="noopener noreferrer"
                               className="flex items-center gap-1.5 text-xs text-pw-accent hover:underline">
                              <FileIcon size={12} /> {nome}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            rows={2}
            placeholder="Rispondi al cliente…"
            className="flex-1 px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim resize-none"
          />
          <button
            onClick={invia}
            disabled={invio || !testo.trim()}
            className="shrink-0 p-2.5 rounded-lg bg-pw-accent text-[#0A263A] disabled:opacity-40"
            aria-label="Invia"
          >
            {invio ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
