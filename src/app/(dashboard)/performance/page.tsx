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
import { cn, formatDate, todayLocal } from '@/lib/utils';
import { OBJECTIVE_STATUS_LABELS, REVIEW_STATUS_LABELS, SKILL_LEVEL_LABELS, FEEDBACK_KIND_LABELS } from '@/lib/constants';
import type {
  EmployeeObjective, ObjectiveStatus,
  PerformanceReview,
  EmployeeSkill,
  PeerFeedback, FeedbackKind,
} from '@/types/database';
import {
  Target, ClipboardCheck, Sparkles, MessageSquareHeart,
  Plus, Check, X, Trash2, AlertTriangle, User, Send,
} from 'lucide-react';

type Tab = 'obiettivi' | 'review' | 'competenze' | 'feedback';

const STATUS_TONE_OBJ: Record<string, 'success' | 'info' | 'neutral'> = {
  active: 'info', completed: 'success', dropped: 'neutral',
};

function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
function quartersAround(n = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  let y = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-Q${q}`);
    q--;
    if (q < 1) { q = 4; y--; }
  }
  return out;
}

export default function PerformancePage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [tab, setTab] = useState<Tab>('obiettivi');
  const [quarter, setQuarter] = useState<string>(currentQuarter());
  const [employees, setEmployees] = useState<{ id: string; full_name: string; color: string | null }[]>([]);
  const [scopeUserId, setScopeUserId] = useState<string>(''); // admin: filtro dipendente

  const [objectives, setObjectives] = useState<EmployeeObjective[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [skills, setSkills] = useState<EmployeeSkill[]>([]);
  const [feedbackReceived, setFeedbackReceived] = useState<PeerFeedback[]>([]);
  const [feedbackSent, setFeedbackSent] = useState<PeerFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Modali
  const [showObjModal, setShowObjModal] = useState(false);
  const [objForm, setObjForm] = useState({ title: '', description: '', target_user_id: '' });

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    user_id: '', what_works: '', what_to_improve: '', next_focus: '', notes: '',
    conducted_on: todayLocal(), finalize: false,
  });

  const [skillForm, setSkillForm] = useState({ skill_name: '', level: 3 });

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ to_user_id: '', kind: 'kudos' as FeedbackKind, message: '' });

  useEffect(() => { setScopeUserId(profile?.id || ''); }, [profile]);

  const targetUserId = (isAdmin && scopeUserId) ? scopeUserId : profile?.id || '';

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    setError(false);
    try {
      const [objRes, revRes, skRes, fbRecvRes, fbSentRes, empRes] = await Promise.all([
        supabase.from('employee_objectives')
          .select('*, user:profiles!employee_objectives_user_id_fkey(id, full_name, color)')
          .eq('user_id', targetUserId).eq('quarter', quarter)
          .order('created_at', { ascending: false }),
        supabase.from('performance_reviews')
          .select('*, user:profiles!performance_reviews_user_id_fkey(id, full_name, color)')
          .eq('user_id', targetUserId).order('conducted_on', { ascending: false, nullsFirst: false })
          .limit(20),
        supabase.from('employee_skills')
          .select('*').eq('user_id', targetUserId).order('level', { ascending: false }),
        supabase.from('peer_feedback')
          .select('*, from_user:profiles!peer_feedback_from_user_id_fkey(id, full_name, color)')
          .eq('to_user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('peer_feedback')
          .select('*, to_user:profiles!peer_feedback_to_user_id_fkey(id, full_name, color)')
          .eq('from_user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        isAdmin
          ? supabase.from('profiles').select('id, full_name, color').eq('is_active', true).order('full_name')
          : supabase.from('profiles').select('id, full_name, color').eq('is_active', true).neq('id', profile.id).order('full_name'),
      ]);

      setObjectives((objRes.data as EmployeeObjective[]) || []);
      setReviews((revRes.data as PerformanceReview[]) || []);
      setSkills((skRes.data as EmployeeSkill[]) || []);
      setFeedbackReceived((fbRecvRes.data as PeerFeedback[]) || []);
      setFeedbackSent((fbSentRes.data as PeerFeedback[]) || []);
      setEmployees((empRes.data as { id: string; full_name: string; color: string | null }[]) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin, targetUserId, quarter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Obiettivi ───────────────────────────────────────────────
  const handleAddObjective = async () => {
    if (!profile) return;
    if (!objForm.title.trim()) { toast.error('Titolo obbligatorio'); return; }
    const finalUserId = isAdmin && objForm.target_user_id ? objForm.target_user_id : targetUserId;
    try {
      const { error } = await supabase.from('employee_objectives').insert({
        user_id: finalUserId,
        quarter,
        title: objForm.title.trim(),
        description: objForm.description.trim() || null,
        created_by: profile.id,
      });
      if (error) throw error;
      toast.success('Obiettivo aggiunto');
      setShowObjModal(false);
      setObjForm({ title: '', description: '', target_user_id: '' });
      fetchAll();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleProgressChange = async (id: string, progress: number) => {
    const { error } = await supabase.from('employee_objectives').update({ progress }).eq('id', id);
    if (error) toast.error('Errore aggiornamento');
    else setObjectives(prev => prev.map(o => o.id === id ? { ...o, progress } : o));
  };

  const handleStatusChange = async (id: string, status: ObjectiveStatus) => {
    const { error } = await supabase.from('employee_objectives').update({ status }).eq('id', id);
    if (error) toast.error('Errore aggiornamento');
    else { toast.success('Stato aggiornato'); fetchAll(); }
  };

  const handleDeleteObjective = async (id: string) => {
    if (!confirm('Eliminare questo obiettivo?')) return;
    const { error } = await supabase.from('employee_objectives').delete().eq('id', id);
    if (error) toast.error('Errore'); else { toast.success('Eliminato'); fetchAll(); }
  };

  // ─── Review ─────────────────────────────────────────────────
  const handleSaveReview = async () => {
    if (!profile || !isAdmin) return;
    if (!reviewForm.user_id) { toast.error('Seleziona un dipendente'); return; }
    try {
      const { error } = await supabase.from('performance_reviews').insert({
        user_id: reviewForm.user_id,
        reviewer_id: profile.id,
        quarter,
        what_works: reviewForm.what_works.trim() || null,
        what_to_improve: reviewForm.what_to_improve.trim() || null,
        next_focus: reviewForm.next_focus.trim() || null,
        notes: reviewForm.notes.trim() || null,
        status: reviewForm.finalize ? 'finalized' : 'draft',
        conducted_on: reviewForm.conducted_on || null,
      });
      if (error) throw error;
      toast.success('Review salvata');
      setShowReviewModal(false);
      setReviewForm({ user_id: '', what_works: '', what_to_improve: '', next_focus: '', notes: '', conducted_on: todayLocal(), finalize: false });
      fetchAll();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  // ─── Skills ─────────────────────────────────────────────────
  const handleAddSkill = async () => {
    if (!profile || !skillForm.skill_name.trim()) return;
    try {
      const { error } = await supabase.from('employee_skills').insert({
        user_id: targetUserId,
        skill_name: skillForm.skill_name.trim(),
        level: skillForm.level,
      });
      if (error) throw error;
      toast.success('Competenza aggiunta');
      setSkillForm({ skill_name: '', level: 3 });
      fetchAll();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleSkillLevel = async (id: string, level: number) => {
    const { error } = await supabase.from('employee_skills').update({ level }).eq('id', id);
    if (error) toast.error('Errore');
    else setSkills(prev => prev.map(s => s.id === id ? { ...s, level } : s));
  };

  const handleDeleteSkill = async (id: string) => {
    const { error } = await supabase.from('employee_skills').delete().eq('id', id);
    if (error) toast.error('Errore'); else { toast.success('Eliminata'); fetchAll(); }
  };

  // ─── Feedback ───────────────────────────────────────────────
  const handleSendFeedback = async () => {
    if (!profile) return;
    if (!feedbackForm.to_user_id) { toast.error('Seleziona un destinatario'); return; }
    if (!feedbackForm.message.trim()) { toast.error('Scrivi un messaggio'); return; }
    try {
      const { error } = await supabase.from('peer_feedback').insert({
        from_user_id: profile.id,
        to_user_id: feedbackForm.to_user_id,
        kind: feedbackForm.kind,
        message: feedbackForm.message.trim(),
      });
      if (error) throw error;
      toast.success('Feedback inviato');
      setShowFeedbackModal(false);
      setFeedbackForm({ to_user_id: '', kind: 'kudos', message: '' });
      fetchAll();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore');
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('Eliminare questo feedback?')) return;
    const { error } = await supabase.from('peer_feedback').delete().eq('id', id);
    if (error) toast.error('Errore'); else { toast.success('Eliminato'); fetchAll(); }
  };

  // ─── Render ─────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'obiettivi', label: 'Obiettivi', icon: Target },
    { id: 'review', label: 'Review', icon: ClipboardCheck },
    { id: 'competenze', label: 'Competenze', icon: Sparkles },
    { id: 'feedback', label: 'Feedback', icon: MessageSquareHeart },
  ];

  const quarterOptions = useMemo(() => quartersAround(8).map(q => ({ value: q, label: q })), []);

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={2} />
        <SkeletonList variant="row" count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <button onClick={() => { setLoading(true); setError(false); fetchAll(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Performance"
        subtitle={`${quarter}${isAdmin && scopeUserId !== profile?.id ? ` · ${employees.find(e => e.id === scopeUserId)?.full_name || ''}` : ''}`}
      />

      {/* Filtri quarter + (admin) dipendente */}
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Select value={quarter} onChange={(e) => setQuarter(e.target.value)} options={quarterOptions} />
        </div>
        {isAdmin && (
          <div className="w-60">
            <Select
              value={scopeUserId || profile?.id || ''}
              onChange={(e) => setScopeUserId(e.target.value)}
              options={[
                { value: profile?.id || '', label: 'Le mie' },
                ...employees.filter(e => e.id !== profile?.id).map(e => ({ value: e.id, label: e.full_name })),
              ]}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-pw-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                active ? 'border-pw-accent text-pw-text' : 'border-transparent text-pw-text-muted hover:text-pw-text'
              )}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Obiettivi ── */}
      {tab === 'obiettivi' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => { setObjForm({ title: '', description: '', target_user_id: targetUserId }); setShowObjModal(true); }}>
              <Plus size={14} /> Nuovo obiettivo
            </Button>
          </div>

          {objectives.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Nessun obiettivo per questo trimestre"
              description="Definisci 2-3 obiettivi misurabili per il trimestre. Aggiornerai l'avanzamento man mano che procedi."
              action={<Button variant="primary" onClick={() => { setObjForm({ title: '', description: '', target_user_id: targetUserId }); setShowObjModal(true); }}><Plus size={14} /> Nuovo obiettivo</Button>}
            />
          ) : (
            <div className="space-y-3">
              {objectives.map((o) => (
                <Card key={o.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-pw-text">{o.title}</p>
                        {o.description && <p className="text-xs text-pw-text-muted mt-1">{o.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge tone={STATUS_TONE_OBJ[o.status]} dot>{OBJECTIVE_STATUS_LABELS[o.status]}</Badge>
                        <button onClick={() => handleDeleteObjective(o.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2" title="Elimina"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0} max={100} step={5}
                        value={o.progress}
                        onChange={(e) => handleProgressChange(o.id, Number(e.target.value))}
                        className="flex-1 accent-pw-accent"
                      />
                      <span className="text-sm font-semibold text-pw-text tabular-nums w-12 text-right">{o.progress}%</span>
                      <Select
                        value={o.status}
                        onChange={(e) => handleStatusChange(o.id, e.target.value as ObjectiveStatus)}
                        options={Object.entries(OBJECTIVE_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Review ── */}
      {tab === 'review' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => { setReviewForm(r => ({ ...r, user_id: scopeUserId || '' })); setShowReviewModal(true); }}>
                <Plus size={14} /> Nuova review
              </Button>
            </div>
          )}

          {reviews.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Nessuna review"
              description={isAdmin ? 'Avvia un 1:1 e tieni traccia di cosa funziona, cosa migliorare e dove puntare nel trimestre.' : 'Le tue review apparirano qui dopo gli incontri 1:1 con l\'amministrazione.'}
            />
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck size={16} className="text-pw-text-muted" />
                        <p className="text-sm font-medium text-pw-text">{r.quarter}{r.conducted_on ? ` · ${formatDate(r.conducted_on)}` : ''}</p>
                      </div>
                      <Badge tone={r.status === 'finalized' ? 'success' : 'neutral'} dot>{REVIEW_STATUS_LABELS[r.status]}</Badge>
                    </div>
                    {r.what_works && <ReviewField label="Cosa funziona" value={r.what_works} />}
                    {r.what_to_improve && <ReviewField label="Cosa migliorare" value={r.what_to_improve} />}
                    {r.next_focus && <ReviewField label="Obiettivi prossimi" value={r.next_focus} />}
                    {r.notes && <ReviewField label="Note" value={r.notes} />}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Competenze ── */}
      {tab === 'competenze' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <Input
                id="skill-name" label="Nuova competenza"
                value={skillForm.skill_name}
                onChange={(e) => setSkillForm(f => ({ ...f, skill_name: e.target.value }))}
                placeholder="es. SEO tecnico"
                className="flex-1 min-w-[200px]"
              />
              <div className="w-40">
                <Select
                  id="skill-level" label="Livello"
                  value={String(skillForm.level)}
                  onChange={(e) => setSkillForm(f => ({ ...f, level: Number(e.target.value) }))}
                  options={Object.entries(SKILL_LEVEL_LABELS).map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))}
                />
              </div>
              <Button onClick={handleAddSkill} disabled={!skillForm.skill_name.trim()}><Plus size={14} /> Aggiungi</Button>
            </CardContent>
          </Card>

          {skills.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nessuna competenza mappata"
              description="Aggiungi le tue competenze con il livello da 1 (principiante) a 5 (esperto). Utile per orientarti su cosa sviluppare."
            />
          ) : (
            <div className="space-y-2">
              {skills.map(s => (
                <Card key={s.id}>
                  <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium text-pw-text truncate">{s.skill_name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(lvl => (
                          <button key={lvl} onClick={() => handleSkillLevel(s.id, lvl)} title={SKILL_LEVEL_LABELS[lvl]}
                            className={cn('w-5 h-5 rounded-sm transition-colors', lvl <= s.level ? 'bg-pw-accent' : 'bg-pw-surface-2 border border-pw-border')} />
                        ))}
                      </div>
                      <span className="text-xs text-pw-text-muted w-24">{SKILL_LEVEL_LABELS[s.level]}</span>
                      <button onClick={() => handleDeleteSkill(s.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2"><Trash2 size={14} /></button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Feedback ── */}
      {tab === 'feedback' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => { setFeedbackForm({ to_user_id: '', kind: 'kudos', message: '' }); setShowFeedbackModal(true); }}>
              <Send size={14} /> Invia feedback
            </Button>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2"><MessageSquareHeart size={16} /> Ricevuti</h2>
            {feedbackReceived.length === 0 ? (
              <EmptyState icon={MessageSquareHeart} title="Nessun feedback ricevuto" description="Quando un collega ti manderà un kudos o un suggerimento, lo vedrai qui." />
            ) : (
              <div className="space-y-2">
                {feedbackReceived.map(f => (
                  <Card key={f.id}>
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: f.from_user?.color || 'var(--pw-accent)' }}>
                            {f.from_user?.full_name?.slice(0, 1) || '?'}
                          </span>
                          <span className="text-sm font-medium text-pw-text">{f.from_user?.full_name || 'Collega'}</span>
                          <Badge tone={f.kind === 'kudos' ? 'success' : 'info'}>{FEEDBACK_KIND_LABELS[f.kind]}</Badge>
                        </div>
                        <span className="text-xs text-pw-text-dim shrink-0">{formatDate(f.created_at)}</span>
                      </div>
                      <p className="text-sm text-pw-text-muted mt-2">{f.message}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2"><Send size={16} /> Inviati</h2>
            {feedbackSent.length === 0 ? (
              <p className="text-sm text-pw-text-muted">Nessun feedback inviato.</p>
            ) : (
              <div className="space-y-2">
                {feedbackSent.map(f => (
                  <Card key={f.id}>
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={14} className="text-pw-text-muted" />
                          <span className="text-sm text-pw-text">A {f.to_user?.full_name || 'collega'}</span>
                          <Badge tone={f.kind === 'kudos' ? 'success' : 'info'}>{FEEDBACK_KIND_LABELS[f.kind]}</Badge>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-pw-text-dim">{formatDate(f.created_at)}</span>
                          <button onClick={() => handleDeleteFeedback(f.id)} className="p-1 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2"><Trash2 size={12} /></button>
                        </div>
                      </div>
                      <p className="text-sm text-pw-text-muted mt-2">{f.message}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modali ── */}
      <Modal open={showObjModal} onClose={() => setShowObjModal(false)} title="Nuovo obiettivo" size="sm">
        <div className="space-y-4">
          <Input id="obj-title" label="Titolo" value={objForm.title} onChange={(e) => setObjForm(f => ({ ...f, title: e.target.value }))} placeholder="es. Portare 3 nuovi clienti SEO" />
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Descrizione (opzionale)</label>
            <textarea value={objForm.description} onChange={(e) => setObjForm(f => ({ ...f, description: e.target.value }))} rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none" />
          </div>
          {isAdmin && (
            <Select id="obj-target" label="Per dipendente"
              value={objForm.target_user_id}
              onChange={(e) => setObjForm(f => ({ ...f, target_user_id: e.target.value }))}
              options={employees.map(e => ({ value: e.id, label: e.full_name }))}
              placeholder="Seleziona"
            />
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setShowObjModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleAddObjective} className="flex-1"><Check size={14} /> Aggiungi</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showReviewModal} onClose={() => setShowReviewModal(false)} title="Nuova review 1:1" size="md">
        <div className="space-y-4">
          <Select id="rev-user" label="Dipendente" value={reviewForm.user_id}
            onChange={(e) => setReviewForm(r => ({ ...r, user_id: e.target.value }))}
            options={employees.filter(e => e.id !== profile?.id).map(e => ({ value: e.id, label: e.full_name }))}
            placeholder="Seleziona" />
          <Input id="rev-date" type="date" label="Data incontro" value={reviewForm.conducted_on} onChange={(e) => setReviewForm(r => ({ ...r, conducted_on: e.target.value }))} />
          {(['what_works', 'what_to_improve', 'next_focus', 'notes'] as const).map((field) => (
            <div key={field}>
              <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">
                {field === 'what_works' ? 'Cosa funziona' : field === 'what_to_improve' ? 'Cosa migliorare' : field === 'next_focus' ? 'Obiettivi prossimi' : 'Note'}
              </label>
              <textarea value={reviewForm[field]} onChange={(e) => setReviewForm(r => ({ ...r, [field]: e.target.value }))} rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none" />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-pw-text cursor-pointer">
            <input type="checkbox" checked={reviewForm.finalize} onChange={(e) => setReviewForm(r => ({ ...r, finalize: e.target.checked }))} className="accent-pw-accent" />
            Salva come finalizzata (altrimenti resta bozza)
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowReviewModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSaveReview} className="flex-1"><Check size={14} /> Salva</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} title="Invia feedback" size="sm">
        <div className="space-y-4">
          <Select id="fb-to" label="A" value={feedbackForm.to_user_id}
            onChange={(e) => setFeedbackForm(f => ({ ...f, to_user_id: e.target.value }))}
            options={employees.filter(e => e.id !== profile?.id).map(e => ({ value: e.id, label: e.full_name }))}
            placeholder="Seleziona destinatario" />
          <Select id="fb-kind" label="Tipo" value={feedbackForm.kind}
            onChange={(e) => setFeedbackForm(f => ({ ...f, kind: e.target.value as FeedbackKind }))}
            options={[
              { value: 'kudos', label: 'Kudos (complimento)' },
              { value: 'suggestion', label: 'Suggerimento' },
            ]} />
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Messaggio</label>
            <textarea value={feedbackForm.message} onChange={(e) => setFeedbackForm(f => ({ ...f, message: e.target.value }))} rows={4}
              placeholder="Scrivi qualcosa di concreto e onesto…"
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowFeedbackModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSendFeedback} className="flex-1"><Send size={14} /> Invia</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1">{label}</p>
      <p className="text-sm text-pw-text whitespace-pre-wrap">{value}</p>
    </div>
  );
}
