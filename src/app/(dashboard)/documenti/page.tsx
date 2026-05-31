'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { formatDate } from '@/lib/utils';
import { EMPLOYEE_DOCUMENT_TYPE_LABELS } from '@/lib/constants';
import type { EmployeeDocument, EmployeeDocumentType } from '@/types/database';
import {
  Plus, FileText, AlertTriangle, Paperclip, ExternalLink, Trash2,
  Calendar, Hourglass, Check, Files,
} from 'lucide-react';

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date(todayLocal() + 'T00:00:00');
  const target = new Date(date + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatBytes(n: number | null): string {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = n;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function sanitizeFilename(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-100);
}

export default function DocumentiPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  // Upload modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'contratto' as EmployeeDocumentType,
    title: '',
    description: '',
    issued_on: '',
    expires_on: '',
    target_user_id: '' as string,
    file: null as File | null,
  });

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      // RLS filtra automaticamente: dipendente vede solo i propri, admin tutti
      const docsRes = await supabase.from('employee_documents')
        .select('*, user:profiles!employee_documents_user_id_fkey(id, full_name, color)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (docsRes.error) throw docsRes.error;
      setDocs((docsRes.data as EmployeeDocument[]) || []);

      if (isAdmin) {
        const empRes = await supabase.from('profiles')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name');
        setEmployees((empRes.data as { id: string; full_name: string }[]) || []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredDocs = useMemo(() => docs.filter((d) => {
    if (typeFilter !== 'all' && d.type !== typeFilter) return false;
    if (isAdmin && employeeFilter !== 'all' && d.user_id !== employeeFilter) return false;
    return true;
  }), [docs, typeFilter, employeeFilter, isAdmin]);

  const stats = useMemo(() => {
    let expiring = 0, expired = 0;
    for (const d of filteredDocs) {
      const days = daysUntil(d.expires_on);
      if (days === null) continue;
      if (days < 0) expired++;
      else if (days <= 30) expiring++;
    }
    return { total: filteredDocs.length, expiring, expired };
  }, [filteredDocs]);

  const resetForm = () => setForm({
    type: 'contratto', title: '', description: '', issued_on: '', expires_on: '',
    target_user_id: profile?.id || '', file: null,
  });

  const openUploadModal = () => {
    setForm({
      type: 'contratto', title: '', description: '', issued_on: '', expires_on: '',
      target_user_id: profile?.id || '', file: null,
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!profile) return;
    if (!form.title.trim()) { toast.error('Titolo obbligatorio'); return; }
    if (!form.file) { toast.error('Allegato obbligatorio'); return; }
    if (!ACCEPTED_TYPES.includes(form.file.type)) {
      toast.error('Tipo file non supportato (PDF, DOC, immagini)'); return;
    }
    if (form.file.size > MAX_FILE_SIZE) {
      toast.error('File troppo grande (max 20MB)'); return;
    }
    const targetUserId = isAdmin ? (form.target_user_id || profile.id) : profile.id;

    setSubmitting(true);
    let uploadedPath: string | null = null;
    try {
      const ext = (form.file.name.split('.').pop() || 'bin').toLowerCase();
      const uid = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const path = `${targetUserId}/${uid}.${ext}`;
      const { error: upErr } = await supabase.storage.from('employee-documents').upload(path, form.file);
      if (upErr) throw upErr;
      uploadedPath = path;

      const { error } = await supabase.from('employee_documents').insert({
        user_id: targetUserId,
        uploaded_by: profile.id,
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        file_path: path,
        file_name: sanitizeFilename(form.file.name),
        file_size: form.file.size,
        mime_type: form.file.type,
        issued_on: form.issued_on || null,
        expires_on: form.expires_on || null,
      });
      if (error) throw error;
      toast.success('Documento caricato');
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (e) {
      if (uploadedPath) {
        await supabase.storage.from('employee-documents').remove([uploadedPath]).catch(() => {});
      }
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'upload');
    } finally {
      setSubmitting(false);
    }
  };

  const handleView = async (path: string) => {
    const { data, error } = await supabase.storage.from('employee-documents').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Impossibile aprire il documento');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!confirm(`Eliminare definitivamente "${doc.title}"?`)) return;
    try {
      const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id);
      if (error) throw error;
      // Best-effort: rimuovi anche il file fisico
      await supabase.storage.from('employee-documents').remove([doc.file_path]).catch(() => {});
      toast.success('Documento eliminato');
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'eliminazione');
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
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <button onClick={() => { setLoading(true); setError(false); fetchData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Documenti"
        subtitle={isAdmin ? 'Archivio del personale' : 'I tuoi documenti'}
        actions={
          <Button variant="primary" onClick={openUploadModal}>
            <Plus size={14} />
            Carica documento
          </Button>
        }
      />

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Files size={14} /> Totali
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">{stats.total}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">documenti archiviati</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Hourglass size={14} /> In scadenza
            </div>
            <p className={`text-3xl font-semibold leading-none ${stats.expiring > 0 ? 'text-yellow-500' : 'text-pw-text'}`}>{stats.expiring}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">entro 30 giorni</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <AlertTriangle size={14} /> Scaduti
            </div>
            <p className={`text-3xl font-semibold leading-none ${stats.expired > 0 ? 'text-red-500' : 'text-pw-text'}`}>{stats.expired}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">da rinnovare</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3">
        <div className="w-52">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Tutti i tipi' },
              ...Object.entries(EMPLOYEE_DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        {isAdmin && employees.length > 0 && (
          <div className="w-60">
            <Select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Tutto il team' },
                ...employees.map(e => ({ value: e.id, label: e.full_name })),
              ]}
            />
          </div>
        )}
      </div>

      {/* Lista */}
      <div>
        {filteredDocs.length === 0 ? (
          (typeFilter !== 'all' || employeeFilter !== 'all') ? (
            <EmptyState
              icon={FileText}
              title="Nessun documento con questi filtri"
              description="Prova a cambiare tipo o dipendente, oppure azzera i filtri per vedere tutto l'archivio."
              action={
                <Button variant="outline" onClick={() => { setTypeFilter('all'); setEmployeeFilter('all'); }}>
                  Azzera filtri
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Nessun documento"
              description="Carica contratti, certificati, buste paga o altri documenti del personale. Quelli con scadenza riceveranno un avviso automatico a 30, 7 e 0 giorni."
              action={
                <Button variant="primary" onClick={openUploadModal}>
                  <Plus size={14} /> Carica il primo documento
                </Button>
              }
            />
          )
        ) : (
          <div className="space-y-2">
            {filteredDocs.map((d) => {
              const days = daysUntil(d.expires_on);
              const expired = days !== null && days < 0;
              const expiring = days !== null && days >= 0 && days <= 30;
              return (
                <Card key={d.id}>
                  <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0 text-pw-text-muted">
                        <FileText size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-pw-text truncate">{d.title}</p>
                        <p className="text-xs text-pw-text-muted truncate">
                          {EMPLOYEE_DOCUMENT_TYPE_LABELS[d.type]}
                          {isAdmin && d.user?.full_name && ` · ${d.user.full_name}`}
                          {d.issued_on && ` · emesso ${formatDate(d.issued_on)}`}
                          {d.expires_on && ` · scade ${formatDate(d.expires_on)}`}
                          {' · '}{formatBytes(d.file_size)}
                        </p>
                        {d.description && (
                          <p className="text-xs text-pw-text-dim truncate mt-0.5">{d.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {expired && <Badge tone="danger" dot>Scaduto</Badge>}
                      {expiring && !expired && <Badge tone="warning" dot>{days} gg</Badge>}
                      <button
                        onClick={() => handleView(d.file_path)}
                        className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-text"
                        title="Apri"
                      >
                        <ExternalLink size={16} />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(d)}
                          className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-red-400"
                          title="Elimina"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal upload */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Carica documento" size="sm">
        <div className="space-y-4">
          <Select
            id="doc-type"
            label="Tipo"
            value={form.type}
            onChange={(e) => setForm(f => ({ ...f, type: e.target.value as EmployeeDocumentType }))}
            options={Object.entries(EMPLOYEE_DOCUMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Input
            id="doc-title"
            label="Titolo"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="es. Contratto a tempo indeterminato 2026"
          />
          {isAdmin && employees.length > 0 && (
            <Select
              id="doc-target"
              label="Dipendente"
              value={form.target_user_id || profile?.id || ''}
              onChange={(e) => setForm(f => ({ ...f, target_user_id: e.target.value }))}
              options={employees.map(e => ({ value: e.id, label: e.full_name }))}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="doc-issued"
              type="date"
              label="Data emissione"
              value={form.issued_on}
              onChange={(e) => setForm(f => ({ ...f, issued_on: e.target.value }))}
            />
            <Input
              id="doc-expires"
              type="date"
              label="Data scadenza"
              value={form.expires_on}
              onChange={(e) => setForm(f => ({ ...f, expires_on: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Note (opzionale)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Note interne…"
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">File *</label>
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-pw-border bg-pw-surface-2 text-pw-text-muted text-sm cursor-pointer hover:border-pw-accent/50 hover:text-pw-text transition-colors">
              <Paperclip size={14} />
              <span className="truncate">{form.file ? form.file.name : 'Scegli un file (PDF/DOC/immagine, max 20MB)'}</span>
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx"
                onChange={(e) => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
                className="hidden"
              />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSubmit} loading={submitting} className="flex-1">
              <Check size={14} /> Carica
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
