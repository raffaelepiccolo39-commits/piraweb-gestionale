'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Invoice, InvoiceItem, Client, InvoiceStatus, SdiStatus } from '@/types/database';
import {
  Receipt,
  Plus,
  Euro,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Trash2,
  Printer,
  Upload,
  RefreshCw,
  AlertTriangle,
  Zap,
} from 'lucide-react';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Bozza', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: FileText },
  sent: { label: 'Inviata', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Send },
  paid: { label: 'Pagata', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: CheckCircle },
  overdue: { label: 'Scaduta', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: Clock },
  cancelled: { label: 'Annullata', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: XCircle },
};

const SDI_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'In attesa', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  sent_to_sdi: { label: 'Inviata a SDI', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Consegnata', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Scartata', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  not_delivered: { label: 'Non recapitata', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  error: { label: 'Errore', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function InvoicesPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);

  const [form, setForm] = useState({
    client_id: '', description: '', vat_rate: '22', due_date: '',
    period_start: '', period_end: '', notes: '',
  });
  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', unit_price: '' });
  const [sdiLoading, setSdiLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    const { data } = await supabase
      .from('invoices')
      .select('*, client:clients(id, name, company, ragione_sociale, partita_iva)')
      .order('issue_date', { ascending: false });
    setInvoices((data as Invoice[]) || []);
  }, [supabase]);

  const fetchItems = useCallback(async (invoiceId: string) => {
    const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('created_at');
    setItems((data as InvoiceItem[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([
      fetchInvoices(),
      supabase.from('clients').select('id, name, company, ragione_sociale, partita_iva').eq('is_active', true).order('company').then((r) => setClients((r.data as Client[]) || [])),
    ]).finally(() => setLoading(false));
  }, [fetchInvoices, supabase]);

  useEffect(() => {
    if (selectedInvoice) fetchItems(selectedInvoice.id);
  }, [selectedInvoice, fetchItems]);

  const handleCreate = async () => {
    if (!form.client_id || !form.due_date) { toast.error('Cliente e scadenza obbligatori'); return; }
    setCreateLoading(true);
    try {
      const { data, error } = await supabase.from('invoices').insert({
        client_id: form.client_id,
        description: form.description || null,
        vat_rate: parseFloat(form.vat_rate) || 22,
        due_date: form.due_date,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        notes: form.notes || null,
        created_by: profile!.id,
      }).select().single();
      if (!error && data) {
        toast.success(`Fattura ${(data as Invoice).invoice_number} creata`);
        setShowForm(false);
        setForm({ client_id: '', description: '', vat_rate: '22', due_date: '', period_start: '', period_end: '', notes: '' });
        fetchInvoices();
        setSelectedInvoice(data as Invoice);
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!itemForm.description || !itemForm.unit_price || !selectedInvoice) return;
    const qty = parseFloat(itemForm.quantity) || 1;
    const price = parseFloat(itemForm.unit_price) || 0;
    await supabase.from('invoice_items').insert({
      invoice_id: selectedInvoice.id,
      description: itemForm.description,
      quantity: qty,
      unit_price: price,
      total: qty * price,
    });
    setShowAddItem(false);
    setItemForm({ description: '', quantity: '1', unit_price: '' });
    fetchItems(selectedInvoice.id);
    fetchInvoices(); // refresh totals
  };

  const handleDeleteItem = async (itemId: string) => {
    await supabase.from('invoice_items').delete().eq('id', itemId);
    if (selectedInvoice) { fetchItems(selectedInvoice.id); fetchInvoices(); }
  };

  const handleStatusChange = async (invoiceId: string, status: InvoiceStatus) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'paid') updates.paid_at = new Date().toISOString();
    await supabase.from('invoices').update(updates).eq('id', invoiceId);
    toast.success(`Fattura ${status === 'paid' ? 'segnata come pagata' : status === 'sent' ? 'inviata' : 'aggiornata'}`);
    fetchInvoices();
    if (selectedInvoice?.id === invoiceId) setSelectedInvoice((i) => i ? { ...i, status } : null);
  };

  const handleSendToSdi = async (invoiceId: string) => {
    setSdiLoading(true);
    try {
      const res = await fetch('/api/invoices/send-sdi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Fattura inviata a SDI');
        fetchInvoices();
        if (selectedInvoice?.id === invoiceId) {
          setSelectedInvoice((inv) => inv ? { ...inv, sdi_status: 'sent_to_sdi', sdi_filename: data.filename, status: inv.status === 'draft' ? 'sent' as InvoiceStatus : inv.status } : null);
        }
      } else {
        toast.error(data.error || 'Errore invio SDI');
      }
    } catch {
      toast.error('Errore di connessione');
    } finally {
      setSdiLoading(false);
    }
  };

  const handleCheckSdiStatus = async (invoiceId: string) => {
    setSdiLoading(true);
    try {
      const res = await fetch('/api/invoices/sdi-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Stato SDI: ${data.label}`);
        fetchInvoices();
        if (selectedInvoice?.id === invoiceId) {
          setSelectedInvoice((inv) => inv ? { ...inv, sdi_status: data.status, sdi_identifier: data.sdi_identifier, sdi_message: data.label } : null);
        }
      } else {
        toast.error(data.error || 'Errore controllo stato');
      }
    } catch {
      toast.error('Errore di connessione');
    } finally {
      setSdiLoading(false);
    }
  };

  // Stats
  const totalDraft = invoices.filter((i) => i.status === 'draft').reduce((s, i) => s + i.total, 0);
  const totalSent = invoices.filter((i) => i.status === 'sent').reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const totalOverdue = invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text flex items-center gap-2">
            <Receipt size={24} className="text-pw-accent" />
            Fatturazione
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Genera e gestisci le fatture per i tuoi clienti</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus size={16} />Nuova Fattura</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-gray-400">{formatCurrency(totalDraft)}</p>
          <p className="text-[10px] text-pw-text-muted">Bozze</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-blue-400">{formatCurrency(totalSent)}</p>
          <p className="text-[10px] text-pw-text-muted">Inviate</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-green-400">{formatCurrency(totalPaid)}</p>
          <p className="text-[10px] text-pw-text-muted">Pagate</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-lg font-bold text-red-400">{formatCurrency(totalOverdue)}</p>
          <p className="text-[10px] text-pw-text-muted">Scadute</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice list */}
        <div className="space-y-2">
          {invoices.map((inv) => {
            const client = inv.client as Client | undefined;
            const cfg = STATUS_CONFIG[inv.status];
            return (
              <button
                key={inv.id}
                onClick={() => setSelectedInvoice(inv)}
                className={`w-full text-left p-4 rounded-xl transition-colors border ${
                  selectedInvoice?.id === inv.id ? 'bg-pw-accent/10 border-pw-accent/30' : 'bg-pw-surface-2 border-transparent hover:bg-pw-surface-3'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-pw-accent">{inv.invoice_number}</span>
                  <div className="flex items-center gap-1">
                    {inv.sdi_status && SDI_STATUS_CONFIG[inv.sdi_status] && (
                      <Badge className={SDI_STATUS_CONFIG[inv.sdi_status].color + ' text-[9px] px-1.5 py-0'}>
                        SDI
                      </Badge>
                    )}
                    <Badge className={cfg.color}>{cfg.label}</Badge>
                  </div>
                </div>
                <p className="text-sm font-medium text-pw-text">{client?.company || client?.name || '—'}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-bold text-pw-text">{formatCurrency(inv.total)}</span>
                  <span className="text-[10px] text-pw-text-dim">{formatDate(inv.issue_date)}</span>
                </div>
              </button>
            );
          })}
          {invoices.length === 0 && (
            <div className="text-center py-12">
              <Receipt size={48} className="text-pw-text-dim mx-auto mb-3" />
              <p className="text-pw-text-muted">Nessuna fattura ancora</p>
              <p className="text-xs text-pw-text-dim mt-1">Genera e gestisci le fatture per i tuoi clienti</p>
              <Button className="mt-4" onClick={() => setShowForm(true)}>
                <Plus size={14} />
                Crea Fattura
              </Button>
            </div>
          )}
        </div>

        {/* Invoice detail */}
        <div className="lg:col-span-2">
          {selectedInvoice ? (
            <Card>
              <CardContent className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-mono text-pw-accent">{selectedInvoice.invoice_number}</p>
                    <h2 className="text-lg font-bold text-pw-text mt-1">
                      {(selectedInvoice.client as Client | undefined)?.ragione_sociale || (selectedInvoice.client as Client | undefined)?.company || (selectedInvoice.client as Client | undefined)?.name}
                    </h2>
                    {(selectedInvoice.client as Client | undefined)?.partita_iva && (
                      <p className="text-xs text-pw-text-dim">P.IVA: {(selectedInvoice.client as Client | undefined)?.partita_iva}</p>
                    )}
                  </div>
                  <Badge className={STATUS_CONFIG[selectedInvoice.status].color}>
                    {STATUS_CONFIG[selectedInvoice.status].label}
                  </Badge>
                </div>

                {/* Dates */}
                <div className="flex gap-6 text-sm text-pw-text-muted">
                  <span>Emessa: {formatDate(selectedInvoice.issue_date)}</span>
                  <span>Scadenza: {formatDate(selectedInvoice.due_date)}</span>
                  {selectedInvoice.period_start && selectedInvoice.period_end && (
                    <span>Periodo: {formatDate(selectedInvoice.period_start)} - {formatDate(selectedInvoice.period_end)}</span>
                  )}
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-pw-text">Voci fattura</p>
                    {selectedInvoice.status === 'draft' && (
                      <Button size="sm" variant="ghost" onClick={() => setShowAddItem(true)}><Plus size={12} />Aggiungi voce</Button>
                    )}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-pw-border text-[10px] text-pw-text-dim">
                        <th className="text-left py-2">Descrizione</th>
                        <th className="text-right py-2 w-16">Qta</th>
                        <th className="text-right py-2 w-24">Prezzo</th>
                        <th className="text-right py-2 w-24">Totale</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-pw-border/50">
                          <td className="py-2 text-pw-text">{item.description}</td>
                          <td className="py-2 text-right text-pw-text-muted">{item.quantity}</td>
                          <td className="py-2 text-right text-pw-text-muted">{formatCurrency(item.unit_price)}</td>
                          <td className="py-2 text-right font-medium text-pw-text">{formatCurrency(item.total)}</td>
                          <td className="py-2">
                            {selectedInvoice.status === 'draft' && (
                              <button onClick={() => handleDeleteItem(item.id)} className="text-pw-text-dim hover:text-red-400"><Trash2 size={10} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="border-t border-pw-border pt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-pw-text-muted">Imponibile</span><span className="text-pw-text">{formatCurrency(selectedInvoice.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-pw-text-muted">IVA ({selectedInvoice.vat_rate}%)</span><span className="text-pw-text">{formatCurrency(selectedInvoice.vat_amount)}</span></div>
                  <div className="flex justify-between text-base font-bold border-t border-pw-border pt-2 mt-2">
                    <span className="text-pw-text">Totale</span><span className="text-pw-accent">{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {selectedInvoice.status === 'draft' && (
                    <Button size="sm" onClick={() => handleStatusChange(selectedInvoice.id, 'sent')}><Send size={12} />Segna Inviata</Button>
                  )}
                  {(selectedInvoice.status === 'sent' || selectedInvoice.status === 'overdue') && (
                    <Button size="sm" onClick={() => handleStatusChange(selectedInvoice.id, 'paid')}><CheckCircle size={12} />Segna Pagata</Button>
                  )}
                  {selectedInvoice.status === 'draft' && (
                    <Button size="sm" variant="ghost" onClick={() => handleStatusChange(selectedInvoice.id, 'cancelled')}><XCircle size={12} />Annulla</Button>
                  )}
                </div>

                {/* SDI / Fatturazione Elettronica */}
                <div className="border-t border-pw-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-pw-text flex items-center gap-1.5">
                      <Zap size={14} className="text-pw-accent" />
                      Fatturazione Elettronica (SDI)
                    </p>
                    {selectedInvoice.sdi_status && SDI_STATUS_CONFIG[selectedInvoice.sdi_status] && (
                      <Badge className={SDI_STATUS_CONFIG[selectedInvoice.sdi_status].color}>
                        {SDI_STATUS_CONFIG[selectedInvoice.sdi_status].label}
                      </Badge>
                    )}
                  </div>

                  {selectedInvoice.sdi_message && (
                    <p className="text-xs text-pw-text-muted mb-2">{selectedInvoice.sdi_message}</p>
                  )}
                  {selectedInvoice.sdi_identifier && (
                    <p className="text-xs text-pw-text-dim mb-2">ID SDI: <span className="font-mono">{selectedInvoice.sdi_identifier}</span></p>
                  )}
                  {selectedInvoice.sdi_filename && (
                    <p className="text-xs text-pw-text-dim mb-2">File: <span className="font-mono">{selectedInvoice.sdi_filename}</span></p>
                  )}

                  <div className="flex gap-2">
                    {(!selectedInvoice.sdi_status || selectedInvoice.sdi_status === 'error' || selectedInvoice.sdi_status === 'rejected') && items.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => handleSendToSdi(selectedInvoice.id)}
                        loading={sdiLoading}
                      >
                        <Upload size={12} />
                        Invia a SDI
                      </Button>
                    )}
                    {selectedInvoice.sdi_filename && selectedInvoice.sdi_status !== 'delivered' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCheckSdiStatus(selectedInvoice.id)}
                        loading={sdiLoading}
                      >
                        <RefreshCw size={12} />
                        Aggiorna Stato
                      </Button>
                    )}
                    {!selectedInvoice.sdi_status && items.length === 0 && (
                      <p className="text-xs text-pw-text-dim flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Aggiungi almeno una voce per inviare a SDI
                      </p>
                    )}
                  </div>
                </div>

                {selectedInvoice.notes && (
                  <div className="pt-2"><p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-1">Note</p><p className="text-sm text-pw-text-muted">{selectedInvoice.notes}</p></div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-center">
              <div>
                <Receipt size={48} className="text-pw-text-dim mx-auto mb-3" />
                <p className="text-pw-text-muted text-sm">Seleziona una fattura</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create invoice modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuova Fattura">
        <div className="space-y-4">
          <Select label="Cliente" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} options={clients.map((c) => ({ value: c.id, label: c.ragione_sociale || c.company || c.name }))} required />
          <Input label="Descrizione" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Es: Servizi di social media management - Aprile 2026" />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Scadenza" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            <Input label="Periodo da" type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
            <Input label="Periodo a" type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
          </div>
          <Input label="Aliquota IVA (%)" type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} />
          <Textarea label="Note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button><Button onClick={handleCreate} loading={createLoading}>Crea Fattura</Button></div>
        </div>
      </Modal>

      {/* Add item modal */}
      <Modal open={showAddItem} onClose={() => setShowAddItem(false)} title="Aggiungi Voce">
        <div className="space-y-4">
          <Input label="Descrizione" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Es: Gestione social media" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Quantita'" type="number" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
            <Input label="Prezzo unitario (€)" type="number" value={itemForm.unit_price} onChange={(e) => setItemForm({ ...itemForm, unit_price: e.target.value })} required />
          </div>
          {itemForm.quantity && itemForm.unit_price && (
            <p className="text-sm text-pw-text">Totale voce: <strong>{formatCurrency(parseFloat(itemForm.quantity) * parseFloat(itemForm.unit_price))}</strong></p>
          )}
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" onClick={() => setShowAddItem(false)}>Annulla</Button><Button onClick={handleAddItem}>Aggiungi</Button></div>
        </div>
      </Modal>
    </div>
  );
}
