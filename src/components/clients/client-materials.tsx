'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { reportSupabaseError, reportUnknown } from '@/lib/report-error';
import { SOCIAL_MEDIA_BUCKET, MAX_FILE_MB } from '@/lib/social-media';
import { mb } from '@/lib/image-resize';
import {
  Palette, FileText, Lightbulb, Plus, Loader2, Trash2,
  Eye, EyeOff, ExternalLink, Download, Check, MessageSquareWarning,
} from 'lucide-react';

/**
 * Materiali da far approvare al cliente: moodboard e piano scatti, script
 * video, idee video.
 *
 * Tre tipi, un impianto solo: per il cliente sono lo stesso gesto — guardo,
 * approvo o chiedo modifiche — quindi separarli avrebbe significato scrivere
 * tre volte permessi, approvazione e avvisi.
 *
 * Il materiale nasce NON pubblicato: si prepara con calma e lo si mostra al
 * cliente quando è pronto.
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
  is_published: boolean;
  created_at: string;
}

const TIPI: { valore: Tipo; etichetta: string; icona: typeof Palette; descrizione: string }[] = [
  { valore: 'moodboard', etichetta: 'Moodboard e piano scatti', icona: Palette, descrizione: 'Il piano dello shooting da far approvare prima di girare' },
  { valore: 'script', etichetta: 'Script video', icona: FileText, descrizione: 'Il copione da approvare prima delle riprese' },
  { valore: 'idea_video', etichetta: 'Idee video', icona: Lightbulb, descrizione: 'Riferimenti e proposte, anche come link' },
];

export function ClientMaterials({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const { profile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuovo, setNuovo] = useState<Tipo | null>(null);
  const [titolo, setTitolo] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [invio, setInvio] = useState(false);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_materials')
      .select('id, type, title, description, file_path, file_name, external_url, client_approval, client_comment, is_published, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) reportSupabaseError(error, 'materiali-lista', { clientId });
    setMateriali((data as Materiale[]) || []);
    setLoading(false);
  }, [clientId, supabase]);

  useEffect(() => { carica(); }, [carica]);

  const salva = async () => {
    if (!nuovo || !profile) return;
    if (!titolo.trim()) { toast.error('Serve un titolo'); return; }
    if (!file && !link.trim()) { toast.error('Carica un file oppure incolla un link'); return; }

    setInvio(true);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;

      if (file) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(`${file.name} pesa ${mb(file.size)}: il massimo è ${MAX_FILE_MB} MB`);
          return;
        }
        // Stesso bucket dei media social, prefisso docs/: la sua policy
        // guarda il secondo segmento del percorso, che resta il client_id.
        const pulito = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
        filePath = `docs/${clientId}/${crypto.randomUUID().slice(0, 8)}-${pulito}`;
        fileName = file.name;

        const { error } = await supabase.storage
          .from(SOCIAL_MEDIA_BUCKET)
          .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (error) {
          reportUnknown(error, 'client', { op: 'materiale-upload', filePath });
          toast.error('Caricamento del file non riuscito');
          return;
        }
      }

      const { error } = await supabase.from('client_materials').insert({
        client_id: clientId,
        type: nuovo,
        title: titolo.trim(),
        file_path: filePath,
        file_name: fileName,
        external_url: link.trim() || null,
        created_by: profile.id,
      });

      if (error) {
        reportSupabaseError(error, 'materiale-crea', { clientId, type: nuovo });
        toast.error('Errore nel salvataggio');
        return;
      }

      toast.success('Materiale aggiunto — ora è nascosto: pubblicalo quando è pronto');
      setNuovo(null); setTitolo(''); setLink(''); setFile(null);
      carica();
    } finally {
      setInvio(false);
    }
  };

  const pubblica = async (m: Materiale) => {
    const { error } = await supabase
      .from('client_materials')
      .update({ is_published: !m.is_published })
      .eq('id', m.id);
    if (error) { toast.error('Errore'); return; }

    if (m.is_published) {
      toast.success('Nascosto al cliente');
    } else {
      // Pubblicare un materiale e un gesto singolo: l'avviso parte subito.
      // Per i contenuti importati in blocco resta il riepilogo giornaliero,
      // altrimenti un PED da dodici post manderebbe dodici email.
      const res = await fetch('/api/portal/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const body = await res.json().catch(() => ({}));
      toast.success(
        body.inviate > 0
          ? 'Pubblicato — il cliente è stato avvisato via email'
          : 'Pubblicato — nessun avviso: il cliente non ha ancora un accesso'
      );
    }
    carica();
  };

  const elimina = async (m: Materiale) => {
    if (!confirm(`Eliminare "${m.title}"?`)) return;
    if (m.file_path) await supabase.storage.from(SOCIAL_MEDIA_BUCKET).remove([m.file_path]);
    const { error } = await supabase.from('client_materials').delete().eq('id', m.id);
    if (error) { toast.error('Errore nell\'eliminazione'); return; }
    toast.success('Eliminato');
    carica();
  };

  const apriFile = async (m: Materiale) => {
    if (!m.file_path) return;
    const { data } = await supabase.storage.from(SOCIAL_MEDIA_BUCKET).createSignedUrl(m.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else toast.error('File non disponibile');
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-base font-semibold text-pw-text mb-1">Materiali da approvare</h3>
        <p className="text-xs text-pw-text-dim mb-4">
          Moodboard, script e idee video. Il cliente li vede nel portale solo dopo che li pubblichi.
        </p>

        {TIPI.map((t) => {
          const Icona = t.icona;
          const delTipo = materiali.filter((m) => m.type === t.valore);

          return (
            <div key={t.valore} className="mb-5 last:mb-0">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icona size={15} className="text-pw-accent shrink-0" />
                  <span className="text-sm font-medium text-pw-text">{t.etichetta}</span>
                  <span className="text-xs text-pw-text-dim">({delTipo.length})</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setNuovo(t.valore); setTitolo(''); setLink(''); setFile(null); }}>
                  <Plus size={13} /> Aggiungi
                </Button>
              </div>

              {nuovo === t.valore && (
                <div className="rounded-xl border border-pw-border bg-pw-surface-2 p-4 mb-2 space-y-2.5">
                  <p className="text-[11px] text-pw-text-dim">{t.descrizione}</p>
                  <input
                    value={titolo}
                    onChange={(e) => setTitolo(e.target.value)}
                    placeholder="Titolo (es. Shooting collezione autunno)"
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                      {file ? file.name.slice(0, 24) : 'Scegli PDF o immagine'}
                    </Button>
                    {file && (
                      <button onClick={() => setFile(null)} className="text-xs text-pw-text-dim underline">togli</button>
                    )}
                  </div>
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="oppure incolla un link (YouTube, Drive…)"
                    className="w-full px-3 py-2 rounded-lg bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setNuovo(null)}>Annulla</Button>
                    <Button size="sm" variant="primary" onClick={salva} loading={invio}>Salva</Button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-3 text-pw-text-dim"><Loader2 size={15} className="animate-spin" /></div>
              ) : delTipo.length === 0 ? (
                <p className="text-xs text-pw-text-dim py-1">Nessun materiale.</p>
              ) : (
                <div className="space-y-1.5">
                  {delTipo.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-pw-border p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-pw-text truncate">{m.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {!m.is_published && <span className="text-[10px] text-pw-text-dim">Non ancora visibile</span>}
                          {m.is_published && m.client_approval === 'approved' && (
                            <span className="text-[10px] text-green-500 inline-flex items-center gap-1"><Check size={10} /> Approvato</span>
                          )}
                          {m.is_published && m.client_approval === 'changes_requested' && (
                            <span className="text-[10px] text-amber-500 inline-flex items-center gap-1"><MessageSquareWarning size={10} /> Modifiche richieste</span>
                          )}
                          {m.is_published && m.client_approval === 'pending' && (
                            <span className="text-[10px] text-pw-text-dim">In attesa di risposta</span>
                          )}
                        </div>
                        {m.client_comment && (
                          <p className="text-[11px] text-pw-text-muted italic mt-0.5">«{m.client_comment}»</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {m.file_path && (
                          <button onClick={() => apriFile(m)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2" title="Apri il file">
                            <Download size={14} />
                          </button>
                        )}
                        {m.external_url && (
                          <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2" title="Apri il link">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <button onClick={() => pubblica(m)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2" title={m.is_published ? 'Nascondi al cliente' : 'Mostra al cliente'}>
                          {m.is_published ? <Eye size={14} className="text-pw-accent" /> : <EyeOff size={14} />}
                        </button>
                        <button onClick={() => elimina(m)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10" title="Elimina">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </CardContent>
    </Card>
  );
}
