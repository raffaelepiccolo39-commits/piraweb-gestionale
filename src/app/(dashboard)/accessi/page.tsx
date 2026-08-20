'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { reportSupabaseError, reportUnknown } from '@/lib/report-error';
import {
  KeyRound, Plus, Eye, Copy, Check, ExternalLink, Pencil, Trash2, Loader2, Search,
} from 'lucide-react';

/**
 * Archivio degli accessi dei clienti: sito, Instagram, Facebook, TikTok,
 * LinkedIn e qualsiasi altra cosa serva per lavorare al posto loro.
 *
 * Le password NON arrivano insieme all'elenco: si chiedono una alla volta,
 * premendo "mostra". Due motivi — una pagina che stampa cinquanta password
 * e' una pagina che qualcuno prima o poi fotografa, e ogni lettura lascia
 * una traccia nel registro, utile il giorno che una credenziale gira dove
 * non doveva.
 */

interface Accesso {
  id: string;
  client_id: string;
  piattaforma: string;
  etichetta: string | null;
  username: string | null;
  url: string | null;
  note: string | null;
  updated_at: string;
  client: { name: string; company: string | null } | null;
}

const PIATTAFORME = [
  { value: 'sito', label: 'Sito web' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google', label: 'Google / Business' },
  { value: 'altro', label: 'Altro' },
];

const ETICHETTA_PIATTAFORMA: Record<string, string> = Object.fromEntries(
  PIATTAFORME.map((p) => [p.value, p.label]),
);

const vuoto = {
  id: '',
  client_id: '',
  piattaforma: 'instagram',
  etichetta: '',
  username: '',
  password: '',
  url: '',
  note: '',
};

export default function AccessiPage() {
  const supabase = createClient();
  const toast = useToast();

  const [accessi, setAccessi] = useState<Accesso[]>([]);
  const [clienti, setClienti] = useState<{ id: string; nome: string }[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [ricerca, setRicerca] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  const [modulo, setModulo] = useState<typeof vuoto | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  /** Password mostrate in questo momento, per id. */
  const [scoperte, setScoperte] = useState<Record<string, string>>({});
  const [copiato, setCopiato] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const res = await fetch('/api/accessi');
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || 'Non riesco a leggere gli accessi');
        return;
      }
      setAccessi(body.accessi ?? []);
    } catch (err) {
      reportUnknown(err, 'client', { op: 'accessi-elenco' });
      toast.error('Errore di connessione');
    } finally {
      setCaricamento(false);
    }
  }, [toast]);

  const caricaClienti = useCallback(async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, company')
      .eq('is_active', true)
      .order('name');
    if (error) { reportSupabaseError(error, 'accessi-clienti'); return; }
    setClienti((data ?? []).map((c) => ({ id: c.id as string, nome: (c.company as string) || (c.name as string) })));
  }, [supabase]);

  useEffect(() => { void carica(); void caricaClienti(); }, [carica, caricaClienti]);

  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return accessi.filter((a) => {
      if (filtroCliente && a.client_id !== filtroCliente) return false;
      if (!q) return true;
      const nome = a.client?.company || a.client?.name || '';
      return [nome, a.piattaforma, a.etichetta, a.username, a.url]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [accessi, ricerca, filtroCliente]);

  /** Raggruppati per cliente: si cerca "gli accessi di Tizio", non "tutti gli Instagram". */
  const perCliente = useMemo(() => {
    const mappa = new Map<string, { nome: string; righe: Accesso[] }>();
    for (const a of filtrati) {
      const nome = a.client?.company || a.client?.name || 'Senza cliente';
      if (!mappa.has(a.client_id)) mappa.set(a.client_id, { nome, righe: [] });
      mappa.get(a.client_id)!.righe.push(a);
    }
    return [...mappa.values()].sort((x, y) => x.nome.localeCompare(y.nome));
  }, [filtrati]);

  const mostraPassword = async (id: string) => {
    if (scoperte[id]) {
      // Seconda pressione: si richiude. Una password sullo schermo e' una
      // password che qualcuno puo' leggere alle spalle.
      setScoperte((s) => { const n = { ...s }; delete n[id]; return n; });
      return;
    }
    try {
      const res = await fetch(`/api/accessi?id=${id}&mostra=1`);
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || 'Non riesco a leggere la password'); return; }
      if (!body.password) { toast.error('Nessuna password salvata per questo accesso'); return; }
      setScoperte((s) => ({ ...s, [id]: body.password }));
    } catch (err) {
      reportUnknown(err, 'client', { op: 'accessi-mostra' });
      toast.error('Errore di connessione');
    }
  };

  const copia = async (id: string, testo: string, cosa: string) => {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(`${id}:${cosa}`);
      setTimeout(() => setCopiato(null), 1500);
    } catch {
      toast.error('Il telefono non ha permesso la copia');
    }
  };

  const copiaPassword = async (id: string) => {
    const gia = scoperte[id];
    if (gia) { void copia(id, gia, 'pw'); return; }
    try {
      const res = await fetch(`/api/accessi?id=${id}&mostra=1`);
      const body = await res.json();
      if (!res.ok || !body.password) { toast.error(body.error || 'Nessuna password salvata'); return; }
      await copia(id, body.password, 'pw');
    } catch (err) {
      reportUnknown(err, 'client', { op: 'accessi-copia' });
    }
  };

  const salva = async () => {
    if (!modulo) return;
    if (!modulo.client_id) { toast.error('Scegli il cliente'); return; }

    setSalvataggio(true);
    try {
      const nuovo = !modulo.id;
      const res = await fetch('/api/accessi', {
        method: nuovo ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuovo ? { ...modulo, id: undefined } : modulo),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || 'Salvataggio non riuscito'); return; }

      toast.success(nuovo ? 'Accesso salvato' : 'Accesso aggiornato');
      setModulo(null);
      await carica();
    } finally {
      setSalvataggio(false);
    }
  };

  const elimina = async (a: Accesso) => {
    const nome = a.client?.company || a.client?.name || 'questo cliente';
    if (!window.confirm(`Eliminare l'accesso ${ETICHETTA_PIATTAFORMA[a.piattaforma] || a.piattaforma} di ${nome}?`)) return;

    const res = await fetch(`/api/accessi?id=${a.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Eliminazione non riuscita'); return; }
    toast.success('Accesso eliminato');
    await carica();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Business"
        title="Accessi"
        subtitle={caricamento ? 'Carico…' : `${accessi.length} ${accessi.length === 1 ? 'accesso archiviato' : 'accessi archiviati'}`}
        actions={
          <Button variant="primary" onClick={() => setModulo({ ...vuoto })}>
            <Plus size={16} /> Nuovo accesso
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pw-text-dim pointer-events-none" />
          <Input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente, piattaforma, utente…"
            className="pl-9"
          />
        </div>
        <Select
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          placeholder="Tutti i clienti"
          options={clienti.map((c) => ({ value: c.id, label: c.nome }))}
        />
      </div>

      {caricamento ? (
        <div className="flex justify-center py-10 text-pw-text-dim"><Loader2 size={20} className="animate-spin" /></div>
      ) : perCliente.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={accessi.length === 0 ? 'Nessun accesso archiviato' : 'Nessun risultato'}
          description={
            accessi.length === 0
              ? 'Qui finiscono le credenziali dei clienti: sito, Instagram, Facebook, TikTok, LinkedIn. Le password vengono cifrate prima di essere salvate.'
              : 'Prova a cercare altro o togli il filtro.'
          }
        />
      ) : (
        <div className="space-y-5">
          {perCliente.map((gruppo) => (
            <Card key={gruppo.nome}>
              <CardContent className="p-0">
                <div className="px-4 py-2.5 border-b border-pw-border bg-pw-surface-2">
                  <h2 className="text-sm font-semibold text-pw-text">{gruppo.nome}</h2>
                </div>
                <div className="divide-y divide-pw-border">
                  {gruppo.righe.map((a) => (
                    <div key={a.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge tone="accent" size="sm">
                            {ETICHETTA_PIATTAFORMA[a.piattaforma] || a.piattaforma}
                          </Badge>
                          {a.etichetta && (
                            <span className="text-xs text-pw-text-muted truncate">{a.etichetta}</span>
                          )}
                          {a.url && (
                            <a
                              href={a.url.startsWith('http') ? a.url : `https://${a.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-pw-accent inline-flex items-center gap-1 hover:underline"
                            >
                              apri <ExternalLink size={11} />
                            </a>
                          )}
                        </div>

                        {a.username && (
                          <button
                            onClick={() => copia(a.id, a.username!, 'user')}
                            className="text-sm text-pw-text font-mono truncate hover:text-pw-accent transition-colors"
                            title="Copia l'utente"
                          >
                            {a.username}
                            {copiato === `${a.id}:user` ? <Check size={12} className="inline ml-1.5 text-green-500" /> : <Copy size={12} className="inline ml-1.5 opacity-40" />}
                          </button>
                        )}

                        {scoperte[a.id] && (
                          <p className="mt-1 text-sm font-mono text-pw-text bg-pw-surface-2 rounded px-2 py-1 inline-block break-all">
                            {scoperte[a.id]}
                          </p>
                        )}

                        {a.note && <p className="mt-1 text-xs text-pw-text-dim">{a.note}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => mostraPassword(a.id)} title="Mostra o nascondi la password">
                          <Eye size={14} /> {scoperte[a.id] ? 'Nascondi' : 'Mostra'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copiaPassword(a.id)} title="Copia la password">
                          {copiato === `${a.id}:pw` ? <Check size={14} /> : <Copy size={14} />}
                        </Button>
                        <Button aria-label="Modifica accesso" title="Modifica accesso"
                          size="sm"
                          variant="outline"
                          onClick={() => setModulo({
                            id: a.id, client_id: a.client_id, piattaforma: a.piattaforma,
                            etichetta: a.etichetta || '', username: a.username || '',
                            password: '', url: a.url || '', note: a.note || '',
                          })}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button aria-label="Elimina accesso" title="Elimina accesso" size="sm" variant="outline" onClick={() => elimina(a)}>
                          <Trash2 size={14} className="text-pw-danger" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modulo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setModulo(null)}>
          <div
            className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-pw-surface border border-pw-border p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-pw-text mb-4">
              {modulo.id ? 'Modifica accesso' : 'Nuovo accesso'}
            </h2>

            <div className="space-y-3">
              <Select
                label="Cliente"
                value={modulo.client_id}
                onChange={(e) => setModulo({ ...modulo, client_id: e.target.value })}
                placeholder="Scegli il cliente"
                options={clienti.map((c) => ({ value: c.id, label: c.nome }))}
              />
              <Select
                label="Piattaforma"
                value={modulo.piattaforma}
                onChange={(e) => setModulo({ ...modulo, piattaforma: e.target.value })}
                options={PIATTAFORME}
              />
              <Input
                label="Etichetta (facoltativa)"
                value={modulo.etichetta}
                onChange={(e) => setModulo({ ...modulo, etichetta: e.target.value })}
                placeholder="es. profilo aziendale, pannello hosting"
              />
              <Input
                label="Utente o email"
                value={modulo.username}
                onChange={(e) => setModulo({ ...modulo, username: e.target.value })}
              />
              <Input
                label={modulo.id ? 'Nuova password (lascia vuoto per non cambiarla)' : 'Password'}
                type="text"
                value={modulo.password}
                onChange={(e) => setModulo({ ...modulo, password: e.target.value })}
              />
              <Input
                label="Indirizzo (facoltativo)"
                value={modulo.url}
                onChange={(e) => setModulo({ ...modulo, url: e.target.value })}
                placeholder="es. wordpress.miocliente.it/wp-admin"
              />
              <Input
                label="Note (facoltative)"
                value={modulo.note}
                onChange={(e) => setModulo({ ...modulo, note: e.target.value })}
                placeholder="es. serve il codice via SMS al numero dell'ufficio"
              />
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setModulo(null)}>Annulla</Button>
              <Button variant="primary" onClick={salva} loading={salvataggio}>Salva</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
