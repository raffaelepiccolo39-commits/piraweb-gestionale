'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate, todayLocal } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS } from '@/lib/constants';
import { notifyExpenseDecision } from '@/lib/expense-notifications';
import type { EmployeeExpense, ExpenseCategory } from '@/types/database';
import {
  Plus, Check, X, Receipt, Wallet, AlertTriangle, Paperclip, FileText,
  Banknote, ExternalLink, Hourglass,
} from 'lucide-react';

const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger' | 'info'> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  paid: 'success',
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function sanitizeFilename(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-100);
}

export default function NoteSpesePage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';
  const year = new Date().getFullYear();

  const [myExpenses, setMyExpenses] = useState<EmployeeExpense[]>([]);
  const [pending, setPending] = useState<EmployeeExpense[]>([]);
  const [approved, setApproved] = useState<EmployeeExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    category: 'trasferta' as ExpenseCategory,
    amount: '',
    description: '',
    incurred_on: todayLocal(),
    file: null as File | null,
  });

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      const myRes = await supabase.from('employee_expenses')
        .select('*')
        .eq('user_id', profile.id)
        .order('incurred_on', { ascending: false })
        .limit(200);
      if (myRes.error) throw myRes.error;
      setMyExpenses((myRes.data as EmployeeExpense[]) || []);

      if (isAdmin) {
        const [pendRes, approvedRes] = await Promise.all([
          supabase.from('employee_expenses')
            .select('*, user:profiles!employee_expenses_user_id_fkey(id, full_name, color)')
            .eq('status', 'pending')
            .order('incurred_on', { ascending: false }),
          supabase.from('employee_expenses')
            .select('*, user:profiles!employee_expenses_user_id_fkey(id, full_name, color)')
            .eq('status', 'approved')
            .order('reviewed_at', { ascending: false }),
        ]);
        setPending((pendRes.data as EmployeeExpense[]) || []);
        setApproved((approvedRes.data as EmployeeExpense[]) || []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const myPending = myExpenses.filter(e => e.status === 'pending');
  const myApprovedNotPaid = myExpenses.filter(e => e.status === 'approved');
  const myPaidThisYear = myExpenses.filter(e => e.status === 'paid' && e.paid_at && e.paid_at.slice(0, 4) === String(year));
  const sumPending = myPending.reduce((s, e) => s + Number(e.amount), 0);
  const sumApproved = myApprovedNotPaid.reduce((s, e) => s + Number(e.amount), 0);
  const sumPaidYear = myPaidThisYear.reduce((s, e) => s + Number(e.amount), 0);
  const adminToPaySum = approved.reduce((s, e) => s + Number(e.amount), 0);

  const resetForm = () => setForm({
    category: 'trasferta', amount: '', description: '', incurred_on: todayLocal(), file: null,
  });

  const handleSubmit = async () => {
    if (!profile || submitting) return;
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (!form.amount || isNaN(amount) || amount <= 0) { toast.error('Importo non valido'); return; }
    if (!form.incurred_on) { toast.error('Data spesa obbligatoria'); return; }
    if (form.incurred_on > todayLocal()) { toast.error('La data spesa non può essere nel futuro'); return; }
    if (!form.file) { toast.error('Allegato ricevuta obbligatorio'); return; }
    if (!ACCEPTED_TYPES.includes(form.file.type)) {
      toast.error('Tipo file non supportato (usa immagine o PDF)'); return;
    }
    if (form.file.size > MAX_FILE_SIZE) { toast.error('File troppo grande (max 10MB)'); return; }

    setSubmitting(true);
    let uploadedPath: string | null = null;
    try {
      const ext = form.file.name.split('.').pop() || 'bin';
      const uid = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const path = `${profile.id}/${uid}.${ext.toLowerCase()}`;
      const { error: upErr } = await supabase.storage.from('expense-receipts').upload(path, form.file);
      if (upErr) throw upErr;
      uploadedPath = path;

      const { error } = await supabase.from('employee_expenses').insert({
        user_id: profile.id,
        category: form.category,
        amount,
        description: form.description.trim() || null,
        incurred_on: form.incurred_on,
        receipt_path: path,
        receipt_name: sanitizeFilename(form.file.name),
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Nota spese inviata');
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (e) {
      if (uploadedPath) {
        await supabase.storage.from('expense-receipts').remove([uploadedPath]).catch(() => {});
      }
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'invio');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from('expense-receipts').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Impossibile aprire la ricevuta');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCancel = async (id: string) => {
    const exp = myExpenses.find(e => e.id === id);
    try {
      const { error } = await supabase.from('employee_expenses').delete().eq('id', id).eq('status', 'pending');
      if (error) throw error;
      // Best-effort: rimuovi anche il file in storage per non lasciare orfani
      if (exp?.receipt_path) {
        await supabase.storage.from('expense-receipts').remove([exp.receipt_path]).catch(() => {});
      }
      toast.success('Nota spese annullata');
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleApprove = async (id: string) => {
    if (!profile) return;
    const exp = pending.find(r => r.id === id);
    try {
      const { data, error } = await supabase.from('employee_expenses')
        .update({ status: 'approved', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Spesa già evasa da un altro admin');
        fetchData();
        return;
      }
      toast.success('Nota spese approvata');
      if (exp) {
        try { await notifyExpenseDecision(supabase, exp, 'approved', null, profile.id); }
        catch (n) { toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleReject = async () => {
    if (!profile || !rejectId) return;
    const exp = pending.find(r => r.id === rejectId);
    const note = rejectNote.trim() || null;
    try {
      const { data, error } = await supabase.from('employee_expenses')
        .update({ status: 'rejected', reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_note: note })
        .eq('id', rejectId)
        .eq('status', 'pending')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Spesa già evasa da un altro admin');
        setRejectId(null);
        fetchData();
        return;
      }
      toast.success('Nota spese rifiutata');
      if (exp) {
        try { await notifyExpenseDecision(supabase, exp, 'rejected', note, profile.id); }
        catch (n) { toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      setRejectId(null);
      setRejectNote('');
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleMarkPaid = async (id: string) => {
    if (!profile) return;
    const exp = approved.find(r => r.id === id);
    try {
      const { data, error } = await supabase.from('employee_expenses')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'approved')
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('Rimborso già pagato o in stato non valido');
        fetchData();
        return;
      }
      toast.success('Rimborso segnato come pagato');
      if (exp) {
        try { await notifyExpenseDecision(supabase, exp, 'paid', null, profile.id); }
        catch (n) { toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={3} />
        <SkeletonList variant="row" count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-pw-danger" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <button onClick={() => { setLoading(true); setError(false); fetchData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Note spese"
        subtitle={`Anno ${year}`}
        actions={
          <Button variant="primary" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus size={14} />
            Nuova spesa
          </Button>
        }
      />

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Hourglass size={14} /> In attesa
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">{formatCurrency(sumPending)}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">{myPending.length} richieste</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Wallet size={14} /> Da rimborsare
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">{formatCurrency(sumApproved)}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">{myApprovedNotPaid.length} approvate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Check size={14} /> Rimborsate {year}
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">{formatCurrency(sumPaidYear)}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">{myPaidThisYear.length} pagate</p>
          </CardContent>
        </Card>
      </div>

      {/* Admin: Coda approvazioni */}
      {isAdmin && pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
            <Check size={16} className="text-pw-accent" /> Da approvare ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map(exp => (
              <Card key={exp.id}>
                <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0 text-pw-text-muted">
                      <Receipt size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-pw-text truncate">
                        {exp.user?.full_name || 'Dipendente'} · {formatCurrency(exp.amount)}
                      </p>
                      <p className="text-xs text-pw-text-muted truncate">
                        {EXPENSE_CATEGORY_LABELS[exp.category]} · {formatDate(exp.incurred_on)}{exp.description ? ` · ${exp.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleViewReceipt(exp.receipt_path)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-pw-surface-2 text-pw-text-muted text-xs font-medium hover:bg-pw-surface-3 transition-colors" title="Vedi ricevuta">
                      <FileText size={14} /> Ricevuta
                    </button>
                    <button onClick={() => handleApprove(exp.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-500 text-xs font-medium hover:bg-green-500/25 transition-colors">
                      <Check size={14} /> Approva
                    </button>
                    <button onClick={() => { setRejectId(exp.id); setRejectNote(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors">
                      <X size={14} /> Rifiuta
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Admin: Da rimborsare */}
      {isAdmin && approved.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
              <Banknote size={16} className="text-pw-accent" /> Da rimborsare ({approved.length})
            </h2>
            <span className="text-xs text-pw-text-muted">Totale {formatCurrency(adminToPaySum)}</span>
          </div>
          <div className="space-y-2">
            {approved.map(exp => (
              <Card key={exp.id}>
                <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0 text-pw-text-muted">
                      <Wallet size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-pw-text truncate">
                        {exp.user?.full_name || 'Dipendente'} · {formatCurrency(exp.amount)}
                      </p>
                      <p className="text-xs text-pw-text-muted truncate">
                        {EXPENSE_CATEGORY_LABELS[exp.category]} · {formatDate(exp.incurred_on)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleViewReceipt(exp.receipt_path)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-pw-surface-2 text-pw-text-muted text-xs font-medium hover:bg-pw-surface-3 transition-colors">
                      <FileText size={14} /> Ricevuta
                    </button>
                    <button onClick={() => handleMarkPaid(exp.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-500 text-xs font-medium hover:bg-green-500/25 transition-colors">
                      <Check size={14} /> Segna pagata
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Le mie spese */}
      <div>
        <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
          <Receipt size={16} className="text-pw-text-muted" /> Le mie spese
        </h2>
        {myExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nessuna nota spese"
            description="Quando carichi una ricevuta per il rimborso, apparirà qui con il suo stato di approvazione."
            action={
              <Button variant="primary" onClick={() => { resetForm(); setShowModal(true); }}>
                <Plus size={14} /> Nuova spesa
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {myExpenses.map(exp => (
              <Card key={exp.id}>
                <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0 text-pw-text-muted">
                      <Receipt size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-pw-text truncate">
                        {formatCurrency(exp.amount)} · {EXPENSE_CATEGORY_LABELS[exp.category]}
                      </p>
                      <p className="text-xs text-pw-text-muted truncate">
                        {formatDate(exp.incurred_on)}{exp.description ? ` · ${exp.description}` : ''}
                      </p>
                      {exp.status === 'rejected' && exp.review_note && (
                        <p className="text-xs text-pw-danger mt-0.5">Motivo rifiuto: {exp.review_note}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleViewReceipt(exp.receipt_path)} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-text" title="Vedi ricevuta">
                      <ExternalLink size={16} />
                    </button>
                    <Badge tone={STATUS_TONE[exp.status]} dot>{EXPENSE_STATUS_LABELS[exp.status]}</Badge>
                    {exp.status === 'pending' && (
                      <button onClick={() => handleCancel(exp.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-danger" title="Annulla">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal nuova spesa */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuova nota spese" size="sm">
        <div className="space-y-4">
          <Select
            id="exp-cat"
            label="Categoria"
            value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
            options={Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input id="exp-amount" type="number" step="0.01" min="0" label="Importo (€)"
              value={form.amount}
              onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0,00" />
            <Input id="exp-date" type="date" label="Data spesa" max={todayLocal()}
              value={form.incurred_on}
              onChange={(e) => setForm(f => ({ ...f, incurred_on: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Note (opzionale)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Es. cena con cliente Rossi"
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Ricevuta (foto o PDF) *</label>
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-pw-border bg-pw-surface-2 text-pw-text-muted text-sm cursor-pointer hover:border-pw-accent/50 hover:text-pw-text transition-colors">
              <Paperclip size={14} />
              <span className="truncate">{form.file ? form.file.name : 'Scegli un file (JPG/PNG/PDF, max 10MB)'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSubmit} loading={submitting} className="flex-1">
              <Check size={14} /> Invia richiesta
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal rifiuto */}
      <Modal open={!!rejectId} onClose={() => setRejectId(null)} title="Rifiuta nota spese" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Motivo (opzionale)</label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Spiega perché la nota spese è stata rifiutata…"
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)} className="flex-1">Annulla</Button>
            <Button onClick={handleReject} className="flex-1">
              <X size={14} /> Conferma rifiuto
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
