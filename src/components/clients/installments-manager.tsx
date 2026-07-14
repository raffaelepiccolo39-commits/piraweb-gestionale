'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, todayLocal } from '@/lib/utils';
import { Plus, Check, Pencil, Trash2, Wallet, AlertTriangle } from 'lucide-react';
import type { ClientInstallment, InstallmentPaymentMethod } from '@/types/database';
import { reportUnknown } from '@/lib/report-error';

const formatEur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

const PAYMENT_METHOD_OPTIONS: { value: InstallmentPaymentMethod; label: string }[] = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti' },
  { value: 'carta', label: 'Carta' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'assegno', label: 'Assegno' },
  { value: 'altro', label: 'Altro' },
];

const PAYMENT_METHOD_LABELS: Record<InstallmentPaymentMethod, string> =
  Object.fromEntries(PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label])) as Record<InstallmentPaymentMethod, string>;

interface Props {
  clientId: string;
  /** Se valorizzato, gli acconti sono filtrati per progetto e l'add li crea col project_id. */
  projectId?: string | null;
  /** Budget del progetto (se presente). Mostra il riepilogo Budget · Incassato · Residuo. */
  projectBudget?: number | null;
  /** Read-only: solo visualizzazione, niente bottoni di CRUD. */
  readonly?: boolean;
}

interface FormState {
  label: string;
  amount: string;
  due_date: string;
  payment_method: InstallmentPaymentMethod | '';
  paid_now: boolean;
  paid_date: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  label: '',
  amount: '',
  due_date: '',
  payment_method: '',
  paid_now: false,
  paid_date: todayLocal(),
  notes: '',
});

export function InstallmentsManager({ clientId, projectId, projectBudget, readonly }: Props) {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';
  const canEdit = isAdmin && !readonly;

  const [items, setItems] = useState<ClientInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClientInstallment | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<ClientInstallment | null>(null);
  const [paidForm, setPaidForm] = useState({ paid_date: todayLocal(), payment_method: '' as InstallmentPaymentMethod | '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    let q = supabase
      .from('client_installments')
      .select('*, project:projects(id, name)')
      .eq('client_id', clientId)
      .order('sequence_number', { ascending: true })
      .order('created_at', { ascending: true });
    if (projectId !== undefined) {
      q = projectId === null ? q.is('project_id', null) : q.eq('project_id', projectId);
    }
    const { data, error } = await q;
    if (error) {
      reportUnknown(error, 'client', { stage: 'fetch' });
      toast.error('Errore caricamento acconti');
    } else {
      setItems((data as ClientInstallment[]) || []);
    }
    setLoading(false);
  }, [supabase, clientId, projectId, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const paidTotal = items.filter((i) => i.paid_at).reduce((s, i) => s + Number(i.amount), 0);
  const pendingTotal = items.filter((i) => !i.paid_at).reduce((s, i) => s + Number(i.amount), 0);
  const residual = projectBudget != null ? projectBudget - paidTotal : null;
  const nextSequence = items.length > 0 ? Math.max(...items.map((i) => i.sequence_number)) + 1 : 1;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), label: `Acconto ${nextSequence}` });
    setShowForm(true);
  };

  const openEdit = (it: ClientInstallment) => {
    setEditing(it);
    setForm({
      label: it.label,
      amount: String(it.amount),
      due_date: it.due_date || '',
      payment_method: (it.payment_method ?? '') as InstallmentPaymentMethod | '',
      paid_now: !!it.paid_at,
      paid_date: it.paid_at ? it.paid_at.slice(0, 10) : todayLocal(),
      notes: it.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return toast.error('Inserisci una descrizione (es. "Acconto 1")');
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Importo non valido');
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        project_id: projectId ?? null,
        sequence_number: editing?.sequence_number ?? nextSequence,
        label: form.label.trim(),
        amount: amt,
        due_date: form.due_date || null,
        paid_at: form.paid_now ? new Date(form.paid_date + 'T12:00:00').toISOString() : null,
        payment_method: form.payment_method || null,
        notes: form.notes.trim() || null,
        ...(editing ? {} : { created_by: profile?.id ?? null }),
      };
      if (editing) {
        const { error } = await supabase.from('client_installments').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Acconto aggiornato');
      } else {
        const { error } = await supabase.from('client_installments').insert(payload);
        if (error) throw error;
        toast.success('Acconto creato');
      }
      setShowForm(false);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'save' });
      toast.error((e as { message?: string })?.message || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!markingPaid) return;
    try {
      const { error } = await supabase.from('client_installments').update({
        paid_at: new Date(paidForm.paid_date + 'T12:00:00').toISOString(),
        payment_method: paidForm.payment_method || null,
      }).eq('id', markingPaid.id);
      if (error) throw error;
      toast.success('Acconto segnato come pagato');
      setMarkingPaid(null);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'mark_paid' });
      toast.error((e as { message?: string })?.message || 'Errore aggiornamento');
    }
  };

  const handleUnpaid = async (it: ClientInstallment) => {
    try {
      const { error } = await supabase.from('client_installments').update({
        paid_at: null,
      }).eq('id', it.id);
      if (error) throw error;
      toast.success('Acconto rimesso in attesa');
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'unpaid' });
      toast.error('Errore');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('client_installments').delete().eq('id', deletingId);
      if (error) throw error;
      toast.success('Acconto eliminato');
      setDeletingId(null);
      fetchData();
    } catch (e) {
      reportUnknown(e, 'client', { stage: 'delete' });
      toast.error('Errore eliminazione');
    }
  };

  if (loading) return <div className="text-sm text-pw-text-muted">Caricamento acconti…</div>;

  const showBudgetSummary = projectBudget != null;

  return (
    <div className="space-y-3">
      {/* Riepilogo budget (solo se progetto con budget) */}
      {showBudgetSummary && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Card><CardContent className="p-3">
            <div className="text-[11px] text-pw-text-muted uppercase tracking-wide">Budget</div>
            <div className="text-lg font-semibold text-pw-text tabular-nums">{formatEur(projectBudget)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-[11px] text-pw-text-muted uppercase tracking-wide">Incassato</div>
            <div className="text-lg font-semibold text-pw-text tabular-nums">{formatEur(paidTotal)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-[11px] text-pw-text-muted uppercase tracking-wide">In attesa</div>
            <div className="text-lg font-semibold text-pw-text tabular-nums">{formatEur(pendingTotal)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-[11px] text-pw-text-muted uppercase tracking-wide">Residuo</div>
            <div className={`text-lg font-semibold tabular-nums ${(residual ?? 0) < 0 ? 'text-pw-danger' : 'text-pw-text'}`}>
              {formatEur(residual)}
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-pw-text flex items-center gap-2">
          <Wallet size={15} className="text-pw-text-muted" /> Acconti
          {items.length > 0 && <span className="text-xs text-pw-text-dim font-normal">({items.length})</span>}
        </h3>
        {canEdit && (
          <Button variant="primary" onClick={openCreate}>
            <Plus size={14} /> Nuovo acconto
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nessun acconto registrato"
          description="Aggiungi un acconto per iniziare a tracciare i pagamenti."
          action={canEdit ? (
            <Button variant="primary" onClick={openCreate}><Plus size={14} /> Nuovo acconto</Button>
          ) : undefined}
        />
      ) : (
        <Card><CardContent className="p-0 divide-y divide-pw-border">
          {items.map((it) => {
            const overdue = !it.paid_at && it.due_date && it.due_date < todayLocal();
            return (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-1.5 h-10 rounded-full ${it.paid_at ? 'bg-green-500' : overdue ? 'bg-pw-danger' : 'bg-pw-border'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-pw-text">{it.label}</span>
                    {it.project && !projectId && (
                      <Badge tone="neutral">{it.project.name}</Badge>
                    )}
                    {it.paid_at ? (
                      <Badge tone="success" dot>Pagato</Badge>
                    ) : overdue ? (
                      <Badge tone="danger" dot>In ritardo</Badge>
                    ) : (
                      <Badge tone="warning" dot>In attesa</Badge>
                    )}
                  </div>
                  <p className="text-xs text-pw-text-muted truncate">
                    {it.due_date && <>Scadenza {formatDate(it.due_date)}{(it.paid_at || it.payment_method || it.notes) ? ' · ' : ''}</>}
                    {it.paid_at && <>Pagato il {formatDate(it.paid_at)}{it.payment_method ? ` · ${PAYMENT_METHOD_LABELS[it.payment_method]}` : ''}{it.notes ? ' · ' : ''}</>}
                    {it.notes}
                  </p>
                </div>
                <span className="text-base font-semibold text-pw-text tabular-nums whitespace-nowrap">{formatEur(Number(it.amount))}</span>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {!it.paid_at ? (
                      <button
                        onClick={() => { setMarkingPaid(it); setPaidForm({ paid_date: todayLocal(), payment_method: it.payment_method || '' }); }}
                        className="p-1.5 rounded-lg text-pw-text-muted hover:text-green-500 hover:bg-pw-surface-2"
                        aria-label="Segna pagato"
                        title="Segna pagato"
                      >
                        <Check size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUnpaid(it)}
                        className="p-1.5 rounded-lg text-pw-text-muted hover:bg-pw-surface-2"
                        aria-label="Rimetti in attesa"
                        title="Rimetti in attesa"
                      >
                        <AlertTriangle size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(it)}
                      className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2"
                      aria-label="Modifica acconto"
                      title="Modifica"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeletingId(it.id)}
                      className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-danger hover:bg-pw-surface-2"
                      aria-label="Elimina acconto"
                      title="Elimina"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent></Card>
      )}

      {/* Modal nuovo/modifica */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Modifica acconto' : 'Nuovo acconto'} size="sm">
        <div className="space-y-3">
          <Input
            id="inst-label"
            label="Descrizione *"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder='Es. "Acconto 1", "Saldo"'
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="inst-amount"
              label="Importo (€) *"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <Input
              id="inst-due"
              label="Scadenza"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-pw-text cursor-pointer">
            <input type="checkbox" checked={form.paid_now} onChange={(e) => setForm({ ...form, paid_now: e.target.checked })} className="accent-pw-accent" />
            Già pagato
          </label>
          {form.paid_now && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="inst-paid-date"
                label="Data pagamento"
                type="date"
                value={form.paid_date}
                onChange={(e) => setForm({ ...form, paid_date: e.target.value })}
              />
              <Select
                id="inst-method"
                label="Metodo"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value as InstallmentPaymentMethod | '' })}
                options={PAYMENT_METHOD_OPTIONS}
                placeholder="Seleziona…"
              />
            </div>
          )}
          <Textarea
            id="inst-notes"
            label="Note (opzionale)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              <Check size={14} /> {editing ? 'Aggiorna' : 'Salva'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal "segna pagato" */}
      <Modal open={!!markingPaid} onClose={() => setMarkingPaid(null)} title="Conferma pagamento" size="sm">
        {markingPaid && (
          <div className="space-y-3">
            <p className="text-sm text-pw-text-muted">
              Conferma il pagamento di <strong className="text-pw-text">{markingPaid.label}</strong> · {formatEur(Number(markingPaid.amount))}
            </p>
            <Input
              id="paid-date"
              label="Data pagamento"
              type="date"
              value={paidForm.paid_date}
              onChange={(e) => setPaidForm({ ...paidForm, paid_date: e.target.value })}
            />
            <Select
              id="paid-method"
              label="Metodo"
              value={paidForm.payment_method}
              onChange={(e) => setPaidForm({ ...paidForm, payment_method: e.target.value as InstallmentPaymentMethod | '' })}
              options={PAYMENT_METHOD_OPTIONS}
              placeholder="Seleziona metodo…"
            />
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setMarkingPaid(null)} className="flex-1">Annulla</Button>
              <Button onClick={handleMarkPaid} className="flex-1"><Check size={14} /> Conferma</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Eliminare l'acconto?"
        description="L'azione è irreversibile. Lo storico audit (chi-quando) resterà comunque tracciato."
        confirmLabel="Elimina"
        variant="danger"
      />
    </div>
  );
}
