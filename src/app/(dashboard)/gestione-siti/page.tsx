'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatDate, todayLocal } from '@/lib/utils';
import { reportSupabaseError } from '@/lib/report-error';
import type { WebsiteManagement, WebsiteRenewal } from '@/types/database';
import { ClientForm, type ClientFormData } from '@/components/clients/client-form';
import { Globe, Plus, ShieldCheck, Pencil, CheckCircle2 } from 'lucide-react';

/**
 * Gestione Siti — solo admin.
 *
 * Elenco dei siti in gestione annuale: cliente, canone, prossimo rinnovo.
 * "Segna incassato" chiude il rinnovo corrente e programma quello dell'anno
 * dopo (RPC pay_website_renewal). Il canone confluisce nel cashflow.
 */

interface Row extends WebsiteManagement {
  client?: { id: string; name: string; company: string | null };
  renewals?: WebsiteRenewal[];
}

function euro(n: number): string {
  return `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}€`;
}

/** Il prossimo rinnovo non ancora incassato (o l'ultimo in assoluto se tutti pagati). */
function nextRenewal(renewals: WebsiteRenewal[] | undefined): WebsiteRenewal | null {
  if (!renewals || renewals.length === 0) return null;
  const unpaid = renewals.filter((r) => !r.is_paid).sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (unpaid.length > 0) return unpaid[0];
  return [...renewals].sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
}

export default function GestioneSitiPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  // Modale: creazione o modifica.
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [fClient, setFClient] = useState('');
  const [fUrl, setFUrl] = useState('');
  const [fFee, setFFee] = useState('150');
  const [fRenewal, setFRenewal] = useState('');
  const [fStatus, setFStatus] = useState<'active' | 'cancelled'>('active');
  const [fNotes, setFNotes] = useState('');
  // Creazione cliente con anagrafica completa "al volo", durante l'inserimento
  // del sito: apre il form cliente standard in un secondo modale.
  const [clientFormOpen, setClientFormOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const [sitesRes, clientsRes] = await Promise.all([
      supabase
        .from('website_managements')
        .select('*, client:clients(id, name, company), renewals:website_renewals(id, website_id, due_date, amount, is_paid, paid_at, created_at, updated_at)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, name, company').order('name'),
    ]);
    if (sitesRes.error) reportSupabaseError(sitesRes.error, 'gestione-siti-list');
    if (clientsRes.error) reportSupabaseError(clientsRes.error, 'gestione-siti-clients');
    setRows((sitesRes.data as unknown as Row[]) ?? []);
    setClients((clientsRes.data as { id: string; name: string; company: string | null }[]) ?? []);
    setLoading(false);
  }, [supabase, isAdmin]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const usedClientIds = useMemo(() => new Set(rows.map((r) => r.client_id)), [rows]);
  const clientOptions = useMemo(
    () => clients
      .filter((c) => editing?.client_id === c.id || !usedClientIds.has(c.id))
      .map((c) => ({ value: c.id, label: c.company || c.name })),
    [clients, usedClientIds, editing],
  );

  function openCreate() {
    setEditing(null);
    setFClient(''); setFUrl(''); setFFee('150'); setFRenewal(''); setFStatus('active'); setFNotes('');
    setModalOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    setFClient(row.client_id);
    setFUrl(row.site_url ?? '');
    setFFee(String(row.annual_fee));
    setFStatus(row.status);
    setFNotes(row.notes ?? '');
    const next = nextRenewal(row.renewals);
    setFRenewal(next?.due_date ?? '');
    setModalOpen(true);
  }

  async function save() {
    const fee = Number(fFee);
    if (!editing) {
      if (!fClient) { toast.error('Scegli o crea un cliente'); return; }
      if (!fRenewal) { toast.error('Indica la data del primo rinnovo'); return; }
    }
    if (!Number.isFinite(fee) || fee <= 0) { toast.error('Canone non valido'); return; }
    setSaving(true);

    if (!editing) {
      const { error } = await supabase.rpc('create_website_management', {
        p_client_id: fClient,
        p_site_url: fUrl,
        p_annual_fee: fee,
        p_first_renewal: fRenewal,
        p_notes: fNotes,
      });
      setSaving(false);
      if (error) { reportSupabaseError(error, 'gestione-siti-create'); toast.error('Errore nel salvataggio'); return; }
      toast.success('Sito aggiunto');
    } else {
      const { error } = await supabase
        .from('website_managements')
        .update({ site_url: fUrl || null, annual_fee: fee, status: fStatus, notes: fNotes || null })
        .eq('id', editing.id);
      // Il canone aggiornato vale anche sul rinnovo in attesa (quello ancora da incassare).
      const pending = (editing.renewals ?? []).find((r) => !r.is_paid);
      if (!error && pending) {
        await supabase.from('website_renewals').update({ amount: fee }).eq('id', pending.id);
      }
      setSaving(false);
      if (error) { reportSupabaseError(error, 'gestione-siti-update', { id: editing.id }); toast.error('Errore nel salvataggio'); return; }
      toast.success('Sito aggiornato');
    }

    setModalOpen(false);
    void fetchData();
  }

  async function markPaid(renewalId: string) {
    setPaying(renewalId);
    const { error } = await supabase.rpc('pay_website_renewal', { p_renewal_id: renewalId });
    setPaying(null);
    if (error) { reportSupabaseError(error, 'gestione-siti-pay', { renewalId }); toast.error('Errore, riprova'); return; }
    toast.success('Rinnovo incassato — prossimo anno programmato');
    void fetchData();
  }

  function backToSite() {
    setClientFormOpen(false);
    setModalOpen(true);
  }

  async function uploadLogo(file: File, clientId: string): Promise<string | null> {
    const ext = file.name.split('.').pop();
    const fileName = `${clientId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('client-logos').upload(fileName, file);
    if (error) { reportSupabaseError(error, 'gestione-siti-upload-logo', { clientId }); return null; }
    const { data } = supabase.storage.from('client-logos').getPublicUrl(fileName);
    return data.publicUrl;
  }

  // Crea un cliente con anagrafica completa (stesso form della sezione Clienti),
  // poi lo seleziona nel form del sito e torna lì. onSubmit di ClientForm gestisce
  // da sé lo stato di caricamento del bottone.
  async function handleCreateClientInline(data: ClientFormData) {
    if (!profile) return;
    const { logo, monthly_fee, ...fields } = data;
    void monthly_fee; // non è una colonna di clients (vive sui contratti)

    const { data: nc, error } = await supabase
      .from('clients')
      .insert({ ...fields, relationship_start: fields.relationship_start || null, created_by: profile.id })
      .select('id, name, company')
      .single();

    if (error || !nc) {
      reportSupabaseError(error, 'gestione-siti-create-client');
      toast.error('Errore nella creazione del cliente');
      return;
    }

    if (logo) {
      const url = await uploadLogo(logo, nc.id);
      if (url) await supabase.from('clients').update({ logo_url: url }).eq('id', nc.id);
    }

    setClients((prev) => [{ id: nc.id, name: nc.name, company: nc.company }, ...prev]);
    setFClient(nc.id);
    setClientFormOpen(false);
    setModalOpen(true);
    toast.success('Cliente creato');
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Area riservata"
        description="La gestione dei siti è visibile solo agli amministratori."
      />
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        eyebrow="Business"
        title="Gestione Siti"
        subtitle="Rinnovi annuali dei siti web in gestione"
        actions={<Button variant="primary" onClick={openCreate}><Plus size={16} /> Aggiungi sito</Button>}
      />

      {loading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="Nessun sito in gestione"
          description="Aggiungi il primo sito: imposta cliente, canone annuo e data di rinnovo. Ti avviserò 30 giorni prima della scadenza."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pw-border text-left text-xs text-pw-text-dim">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Sito</th>
                    <th className="px-4 py-3 text-right font-medium">Canone</th>
                    <th className="px-4 py-3 font-medium">Prossimo rinnovo</th>
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="px-4 py-3 text-right font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const next = nextRenewal(row.renewals);
                    const clientName = row.client?.company || row.client?.name || '—';
                    return (
                      <tr key={row.id} className="border-b border-pw-border last:border-0 hover:bg-pw-card-hover-bg">
                        <td className="px-4 py-3 font-medium text-pw-text">{clientName}</td>
                        <td className="px-4 py-3 text-pw-text-muted">
                          {row.site_url
                            ? <a href={row.site_url.startsWith('http') ? row.site_url : `https://${row.site_url}`} target="_blank" rel="noopener noreferrer" className="text-pw-accent hover:underline">{row.site_url}</a>
                            : <span className="text-pw-text-dim">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-pw-text">{euro(row.annual_fee)}</td>
                        <td className="px-4 py-3">
                          {next ? (
                            <span className={next.is_paid ? 'text-pw-text-dim' : 'text-pw-text'}>
                              {formatDate(next.due_date)}
                              {next.is_paid && ' (pagato)'}
                            </span>
                          ) : <span className="text-pw-text-dim">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={row.status === 'active' ? 'success' : 'neutral'} size="sm">
                            {row.status === 'active' ? 'Attivo' : 'Cessato'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {next && !next.is_paid && row.status === 'active' && (
                              <Button size="sm" variant="soft" loading={paying === next.id} onClick={() => markPaid(next.id)}>
                                <CheckCircle2 size={14} /> Segna incassato
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Modifica">
                              <Pencil size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifica sito' : 'Aggiungi sito'}>
        <div className="space-y-4">
          {editing ? (
            <Select
              label="Cliente"
              options={clientOptions}
              value={fClient}
              onChange={(e) => setFClient(e.target.value)}
              disabled
            />
          ) : (
            <div className="space-y-2">
              <Select
                label="Cliente"
                placeholder="Scegli un cliente"
                options={clientOptions}
                value={fClient}
                onChange={(e) => setFClient(e.target.value)}
              />
              <button
                type="button"
                onClick={() => { setModalOpen(false); setClientFormOpen(true); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-pw-accent hover:underline"
              >
                <Plus size={13} /> Nuovo cliente (anagrafica completa)
              </button>
            </div>
          )}
          <Input label="Indirizzo del sito" placeholder="es. www.cliente.it" value={fUrl} onChange={(e) => setFUrl(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Canone annuo (€)" type="number" min="0" step="1" value={fFee} onChange={(e) => setFFee(e.target.value)} />
            {!editing ? (
              <Input label="Primo rinnovo" type="date" min={todayLocal()} value={fRenewal} onChange={(e) => setFRenewal(e.target.value)} />
            ) : (
              <Select
                label="Stato"
                options={[{ value: 'active', label: 'Attivo' }, { value: 'cancelled', label: 'Cessato' }]}
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value as 'active' | 'cancelled')}
              />
            )}
          </div>
          <Textarea label="Note" rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
          {editing && (
            <p className="text-xs text-pw-text-dim">
              La data di rinnovo avanza in automatico ogni volta che segni un incasso.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annulla</Button>
            <Button variant="primary" loading={saving} onClick={save}>{editing ? 'Salva' : 'Aggiungi'}</Button>
          </div>
        </div>
      </Modal>

      {/* Anagrafica cliente completa, aperta durante l'inserimento del sito. */}
      <Modal open={clientFormOpen} onClose={backToSite} title="Nuovo cliente" size="lg">
        <ClientForm onSubmit={handleCreateClientInline} onCancel={backToSite} />
      </Modal>
    </div>
  );
}
