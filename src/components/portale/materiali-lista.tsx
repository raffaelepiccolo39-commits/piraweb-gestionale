'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError } from '@/lib/report-error';
import { SOCIAL_MEDIA_BUCKET } from '@/lib/social-media';
import {
  Palette, FileText, Lightbulb, Loader2, ExternalLink, FileDown,
  Check, MessageSquareWarning, ClipboardList,
} from 'lucide-react';

/**
 * Materiali che aspettano una risposta del cliente: moodboard e piano
 * scatti, script video, idee video.
 *
 * La RLS mostra solo i propri e solo quelli pubblicati, quindi qui non si
 * filtra a mano. La risposta passa da portal_review_material: il cliente
 * non ha permessi di scrittura sulla tabella.
 */

type Tipo = 'moodboard' | 'script' | 'idea_video';

interface Materiale {
  id: string;
  type: Tipo;
  title: string;
  description: string | null;
  file_path: string | null;
  file_name: string | null;
  external_url: string | null;
  client_approval: 'pending' | 'approved' | 'changes_requested';
  client_comment: string | null;
  mese_riferimento: string | null;
}

const GRUPPI: { tipo: Tipo; titolo: string; icona: typeof Palette }[] = [
  { tipo: 'moodboard', titolo: 'Moodboard', icona: Palette },
  { tipo: 'script', titolo: 'Script video', icona: FileText },
  { tipo: 'idea_video', titolo: 'Idee video', icona: Lightbulb },
];

export function MaterialiLista({ soloTipo }: { soloTipo?: Tipo }) {
  const supabase = createClient();
  const toast = useToast();

  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [loading, setLoading] = useState(true);
  const [commento, setCommento] = useState('');
  const [chiedeModifiche, setChiedeModifiche] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_materials')
      .select('id, type, title, description, file_path, file_name, external_url, client_approval, client_comment, mese_riferimento')
      .order('created_at', { ascending: false });

    if (error) reportSupabaseError(error, 'portale-materiali', {});
    const righe = (data as Materiale[]) || [];
    setMateriali(soloTipo ? righe.filter((m) => m.type === soloTipo) : righe);
    setLoading(false);
  }, [supabase, soloTipo]);

  useEffect(() => { carica(); }, [carica]);

  /**
   * Apre il documento da approvare.
   *
   * La finestra va aperta SUBITO, prima di firmare il link: Safari su iPhone
   * concede window.open solo mentre il tocco e' ancora in corso, e dopo un
   * await lo blocca in silenzio. Il cliente toccava "Apri il documento" e non
   * succedeva niente — proprio sul documento che gli stiamo chiedendo di
   * approvare.
   */
  const apri = async (m: Materiale) => {
    if (m.external_url) { window.open(m.external_url, '_blank'); return; }
    if (!m.file_path) return;

    const finestra = window.open('', '_blank');
    const { data } = await supabase.storage.from(SOCIAL_MEDIA_BUCKET).createSignedUrl(m.file_path, 600);

    if (!data?.signedUrl) {
      finestra?.close();
      toast.error('Documento non disponibile, scrivici');
      return;
    }
    // Se il blocco popup ha impedito anche l'apertura vuota, si va nella
    // stessa scheda: meglio uscire dalla pagina che non aprire niente.
    if (finestra) finestra.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  };

  const rispondi = async (m: Materiale, esito: 'approved' | 'changes_requested') => {
    if (esito === 'changes_requested' && !commento.trim()) {
      toast.error('Scrivici cosa vorresti cambiare');
      return;
    }
    setInvio(true);
    const { data, error } = await supabase.rpc('portal_review_material', {
      p_material_id: m.id,
      p_approval: esito,
      p_comment: esito === 'changes_requested' ? commento : null,
    });
    setInvio(false);

    if (error || data === false) {
      reportSupabaseError(error ?? new Error('materiale non aggiornabile'), 'portale-approva-materiale', { id: m.id });
      toast.error('Non è stato possibile inviare la risposta, riprova');
      return;
    }
    toast.success(esito === 'approved' ? 'Approvato, grazie!' : 'Richiesta inviata, ci mettiamo mano');
    setChiedeModifiche(null);
    setCommento('');
    carica();
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (materiali.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <ClipboardList size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Niente da approvare</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Qui troverai i piani scatti, gli script e le idee video su cui ci serve il tuo parere.
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-pw-text mb-1">
        {soloTipo ? GRUPPI.find((g) => g.tipo === soloTipo)?.titolo : 'Da approvare'}
      </h2>
      <p className="text-sm text-pw-text-muted mb-5">
        Apri il documento, poi dicci se va bene o cosa cambiare.
      </p>

      <div className="space-y-6">
        {GRUPPI.map((g) => {
          const delGruppo = materiali.filter((m) => m.type === g.tipo);
          if (delGruppo.length === 0) return null;
          const Icona = g.icona;

          return (
            <div key={g.tipo}>
              {!soloTipo && (
                <div className="flex items-center gap-2 mb-2">
                  <Icona size={16} className="text-pw-accent" />
                  <h3 className="text-sm font-semibold text-pw-text">{g.titolo}</h3>
                </div>
              )}

              <div className="space-y-2">
                {delGruppo.map((m) => (
                  <div key={m.id} className="rounded-xl border border-pw-border bg-pw-surface p-4">
                    {m.mese_riferimento && (
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-accent mb-0.5">
                        {new Date(m.mese_riferimento + 'T12:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                      </p>
                    )}
                    <p className="text-sm font-medium text-pw-text">{m.title}</p>
                    {m.description && <p className="text-xs text-pw-text-muted mt-0.5">{m.description}</p>}

                    <button
                      onClick={() => apri(m)}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-sm text-pw-accent font-medium"
                    >
                      {m.external_url ? <><ExternalLink size={14} /> Apri il link</> : <><FileDown size={14} /> Apri il documento</>}
                    </button>

                    <div className="mt-3 pt-3 border-t border-pw-border">
                      {m.client_approval === 'approved' ? (
                        <p className="text-sm text-green-600 dark:text-green-500 inline-flex items-center gap-1.5">
                          <Check size={15} /> Hai approvato
                        </p>
                      ) : m.client_approval === 'changes_requested' ? (
                        <div>
                          <p className="text-sm text-amber-600 dark:text-amber-500 inline-flex items-center gap-1.5 mb-1">
                            <MessageSquareWarning size={15} /> Hai chiesto delle modifiche
                          </p>
                          {m.client_comment && (
                            <p className="text-sm text-pw-text-muted italic">«{m.client_comment}»</p>
                          )}
                        </div>
                      ) : chiedeModifiche === m.id ? (
                        <div className="space-y-2.5">
                          <textarea
                            value={commento}
                            onChange={(e) => setCommento(e.target.value)}
                            rows={3}
                            autoFocus
                            placeholder="Cosa vorresti cambiare?"
                            className="w-full px-3 py-2 rounded-lg bg-pw-surface-2 border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setChiedeModifiche(null); setCommento(''); }} className="px-3 py-1.5 text-sm text-pw-text-muted">
                              Annulla
                            </button>
                            <button
                              onClick={() => rispondi(m, 'changes_requested')}
                              disabled={invio}
                              className="px-4 py-1.5 rounded-lg bg-pw-accent text-[#0A263A] text-sm font-medium disabled:opacity-60"
                            >
                              {invio ? 'Invio…' : 'Invia'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => rispondi(m, 'approved')}
                            disabled={invio}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-500 text-sm font-medium disabled:opacity-60"
                          >
                            <Check size={15} /> Approva
                          </button>
                          <button
                            onClick={() => { setChiedeModifiche(m.id); setCommento(''); }}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-pw-border text-pw-text-muted text-sm font-medium"
                          >
                            <MessageSquareWarning size={15} /> Chiedi modifiche
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
