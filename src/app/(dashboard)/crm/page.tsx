'use client';

import * as Sentry from '@sentry/nextjs';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { DealForm, type DealFormValues } from '@/components/crm/deal-form';
import { ActivityForm, type ActivityFormValues } from '@/components/crm/activity-form';
import { LostReasonForm } from '@/components/crm/lost-reason-form';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton';
import { formatCurrency, formatDate, formatDateTime, getInitials, getUserColor, todayLocal } from '@/lib/utils';
import type { Deal, DealStage, DealActivity, DealActivityType, Profile } from '@/types/database';
import { SERVICE_CATEGORIES } from '@/types/database';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import {
  Plus,
  Users,
  Euro,
  Briefcase,
  TrendingUp,
  Phone,
  Mail,
  Calendar,
  Building2,
  ArrowRight,
  CheckCircle,
  MessageSquare,
  PhoneCall,
  Video,
  FileText,
  Clock,
  Target,
  ChevronRight,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

const STAGES: { id: DealStage; label: string; color: string; bgColor: string }[] = [
  { id: 'lead', label: 'Lead', color: 'text-pw-text-dim', bgColor: 'bg-pw-border' },
  { id: 'proposal', label: 'Proposta', color: 'text-purple-500', bgColor: 'bg-purple-500' },
  { id: 'negotiation', label: 'Negoziazione', color: 'text-orange-500', bgColor: 'bg-orange-500' },
  { id: 'closed_won', label: 'Vinto', color: 'text-green-500', bgColor: 'bg-green-500' },
  { id: 'closed_lost', label: 'Perso', color: 'text-red-500', bgColor: 'bg-red-500' },
];

const SOURCE_LABELS: Record<string, string> = {
  website: 'Sito Web',
  referral: 'Referral',
  social_media: 'Social Media',
  cold_outreach: 'Cold Outreach',
  event: 'Evento',
  ads: 'Advertising',
  other: 'Altro',
};

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: PhoneCall,
  email: Mail,
  meeting: Video,
  note: MessageSquare,
  stage_change: ArrowRight,
  proposal_sent: FileText,
  follow_up: Clock,
};

export default function CRMPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | DealActivityType>('all');
  const [editingActivity, setEditingActivity] = useState<DealActivity | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '' });
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');

  // Lost reason modal (replaces prompt())
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);
  const [pendingLostDealId, setPendingLostDealId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from('deals')
      .select('*, owner:profiles!deals_owner_id_fkey(id, full_name, color)')
      .order('updated_at', { ascending: false });
    setDeals((data as Deal[]) || []);
  }, [supabase]);

  const fetchActivities = useCallback(async (dealId: string) => {
    const { data } = await supabase
      .from('deal_activities')
      .select('*, creator:profiles!deal_activities_created_by_fkey(id, full_name)')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(30);
    setActivities((data as DealActivity[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([
      fetchDeals(),
      supabase.from('profiles').select('id, full_name, role, color').eq('is_active', true).order('full_name').then((r) => setMembers((r.data as Profile[]) || [])),
    ]).finally(() => setLoading(false));
  }, [fetchDeals, supabase]);

  useEffect(() => {
    if (selectedDeal) fetchActivities(selectedDeal.id);
  }, [selectedDeal, fetchActivities]);

  const creatingRef = useRef(false);
  const handleCreate = async (values: DealFormValues) => {
    if (!profile || creatingRef.current) return;
    if (!values.title) { toast.error('Titolo obbligatorio'); return; }
    creatingRef.current = true;
    try {
      const { error } = await supabase.from('deals').insert({
        title: values.title,
        company_name: values.company_name || null,
        contact_name: values.contact_name || null,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        value: parseFloat(values.value) || 0,
        monthly_value: values.monthly_value ? parseFloat(values.monthly_value) : null,
        source: values.source,
        priority: values.priority,
        service_categories: values.service_categories,
        tags: values.tags,
        notes: values.notes || null,
        expected_close_date: values.expected_close_date || null,
        owner_id: values.owner_id || profile.id,
        created_by: profile.id,
      });
      if (error) throw error;
      toast.success('Deal creato');
      setShowForm(false);
      fetchDeals();
    } catch (e) {
      // Prima l'errore era ignorato silenziosamente (audit: "nessuna gestione errore visibile")
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante la creazione del deal');
    } finally {
      creatingRef.current = false;
    }
  };

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    if (newStage === 'closed_lost') {
      setPendingLostDealId(dealId);
      setShowLostReasonModal(true);
      return;
    }

    const { error } = await supabase.from('deals').update({ stage: newStage }).eq('id', dealId);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'crm', stage: 'update_deal_stage' } });
      toast.error('Errore nello spostamento del deal');
      return;
    }
    toast.success(`Deal spostato a: ${STAGES.find((s) => s.id === newStage)?.label}`);
    fetchDeals();
    if (selectedDeal?.id === dealId) {
      setSelectedDeal((d) => d ? { ...d, stage: newStage } : null);
      fetchActivities(dealId);
    }
  };

  const handleConfirmLostDeal = async (reason: string) => {
    if (!pendingLostDealId) return;
    const updates: Record<string, unknown> = {
      stage: 'closed_lost',
      lost_reason: reason.trim() || null,
    };
    await supabase.from('deals').update(updates).eq('id', pendingLostDealId);
    toast.success(`Deal spostato a: ${STAGES.find((s) => s.id === 'closed_lost')?.label}`);
    setShowLostReasonModal(false);
    setPendingLostDealId(null);
    fetchDeals();
    if (selectedDeal?.id === pendingLostDealId) {
      setSelectedDeal((d) => d ? { ...d, stage: 'closed_lost' as DealStage } : null);
      fetchActivities(pendingLostDealId);
    }
  };

  const handleAddActivity = async (values: ActivityFormValues) => {
    if (!profile || !values.title || !selectedDeal) return;
    await supabase.from('deal_activities').insert({
      deal_id: selectedDeal.id,
      type: values.type,
      title: values.title,
      description: values.description || null,
      scheduled_at: values.scheduled_at || null,
      created_by: profile.id,
    });
    setShowActivity(false);
    fetchActivities(selectedDeal.id);
  };

  const handleUpdateDeal = async (values: DealFormValues) => {
    if (!editingDeal) return;
    if (!values.title) { toast.error('Titolo obbligatorio'); return; }
    const { error } = await supabase.from('deals').update({
      title: values.title,
      company_name: values.company_name || null,
      contact_name: values.contact_name || null,
      contact_email: values.contact_email || null,
      contact_phone: values.contact_phone || null,
      value: parseFloat(values.value) || 0,
      monthly_value: values.monthly_value ? parseFloat(values.monthly_value) : null,
      source: values.source,
      priority: values.priority,
      service_categories: values.service_categories,
      tags: values.tags,
      notes: values.notes || null,
      expected_close_date: values.expected_close_date || null,
      owner_id: values.owner_id || editingDeal.owner_id,
    }).eq('id', editingDeal.id);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'crm', stage: 'update_deal' }, extra: { dealId: editingDeal.id } });
      toast.error(error.message || 'Errore aggiornamento deal');
      return;
    }
    toast.success('Deal aggiornato');
    setEditingDeal(null);
    // se il deal aperto è lo stesso, ricarica i dati nel modal dettaglio
    if (selectedDeal?.id === editingDeal.id) {
      const { data: refreshed } = await supabase
        .from('deals')
        .select('*, owner:profiles!deals_owner_id_fkey(id, full_name, color)')
        .eq('id', editingDeal.id)
        .single();
      if (refreshed) setSelectedDeal(refreshed as Deal);
    }
    fetchDeals();
  };

  const handleDeleteDeal = async () => {
    if (!deletingDeal) return;
    const { error } = await supabase.from('deals').delete().eq('id', deletingDeal.id);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'crm', stage: 'delete_deal' }, extra: { dealId: deletingDeal.id } });
      toast.error('Errore eliminazione deal');
      return;
    }
    toast.success('Deal eliminato');
    setDeletingDeal(null);
    setSelectedDeal(null);
    fetchDeals();
  };

  const handleStartEditActivity = (a: DealActivity) => {
    setEditingActivity(a);
    setEditForm({ title: a.title, description: a.description || '' });
  };

  const handleSaveEditActivity = async () => {
    if (!editingActivity || !selectedDeal) return;
    if (!editForm.title.trim()) { toast.error('Titolo obbligatorio'); return; }
    const { error } = await supabase.from('deal_activities').update({
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
    }).eq('id', editingActivity.id);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'crm', stage: 'edit_activity' } });
      toast.error('Errore modifica attività');
      return;
    }
    toast.success('Attività aggiornata');
    setEditingActivity(null);
    fetchActivities(selectedDeal.id);
  };

  const handleDeleteActivity = async () => {
    if (!deletingActivityId || !selectedDeal) return;
    const { error } = await supabase.from('deal_activities').delete().eq('id', deletingActivityId);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'crm', stage: 'delete_activity' } });
      toast.error('Errore eliminazione');
      return;
    }
    toast.success('Attività eliminata');
    setDeletingActivityId(null);
    fetchActivities(selectedDeal.id);
  };

  const handleSaveQuickNote = async () => {
    if (!profile || !selectedDeal) return;
    const txt = quickNote.trim();
    if (!txt) return;
    setSavingNote(true);
    // Title = prima riga (max 80 char), description = resto se presente
    const firstNl = txt.indexOf('\n');
    const title = (firstNl > 0 ? txt.slice(0, firstNl) : txt).slice(0, 80);
    const description = firstNl > 0 ? txt.slice(firstNl + 1).trim() || null
                      : (txt.length > 80 ? txt : null);
    const { error } = await supabase.from('deal_activities').insert({
      deal_id: selectedDeal.id,
      type: 'note',
      title,
      description,
      completed: true,
      created_by: profile.id,
    });
    setSavingNote(false);
    if (error) {
      Sentry.captureException(error, { tags: { route: 'crm', stage: 'quick_note' }, extra: { dealId: selectedDeal.id } });
      toast.error('Errore salvataggio nota');
      return;
    }
    setQuickNote('');
    fetchActivities(selectedDeal.id);
    toast.success('Nota salvata');
  };

  const handleConvertToClient = async (deal: Deal) => {
    if (!profile) return;
    // Idempotenza: deal già convertito → nessuna azione (evita clienti duplicati su doppio click)
    if (deal.converted_client_id) {
      toast.error('Deal già convertito in cliente');
      return;
    }
    try {
      const { data: client, error } = await supabase.from('clients').insert({
        name: deal.contact_name || deal.title,
        company: deal.company_name || null,
        email: deal.contact_email || null,
        phone: deal.contact_phone || null,
        notes: `Convertito da deal: ${deal.title}\n${deal.notes || ''}`,
        created_by: profile.id,
      }).select('id').single();
      if (error || !client) throw error || new Error('Creazione cliente fallita');

      const { error: updErr } = await supabase.from('deals').update({
        converted_client_id: client.id,
        stage: 'closed_won',
      }).eq('id', deal.id).is('converted_client_id', null);
      if (updErr) throw updErr;

      toast.success('Deal convertito in cliente!');
      fetchDeals();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante la conversione');
    }
  };

  // Pipeline stats
  const activeDeals = deals.filter((d) => !['closed_won', 'closed_lost'].includes(d.stage));
  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
  const weightedValue = activeDeals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0);
  const wonDeals = deals.filter((d) => d.stage === 'closed_won');
  const lostDeals = deals.filter((d) => d.stage === 'closed_lost');
  const winRate = wonDeals.length + lostDeals.length > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0;

  // Una singola passata su deals per indicizzare per stage (Map),
  // invece di 6 .filter() per render (uno per stage del kanban).
  // Su 200 deal passa da ~1200 confronti per render a 200.
  const dealsByStage = useMemo(() => {
    const map = new Map<DealStage, Deal[]>();
    for (const stage of STAGES) map.set(stage.id, []);
    for (const d of deals) {
      const list = map.get(d.stage as DealStage);
      if (list) list.push(d);
    }
    return map;
  }, [deals]);
  const getDealsForStage = (stage: DealStage) => dealsByStage.get(stage) || [];

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Target size={40} className="mx-auto text-pw-text-dim mb-3" />
          <p className="text-pw-text font-semibold">Accesso non autorizzato</p>
          <p className="text-sm text-pw-text-muted mt-1">Solo gli amministratori possono accedere a questa sezione</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={5} />
        <SkeletonList variant="row" count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="CRM Pipeline"
        subtitle={`${activeDeals.length} deal attivi · ${formatCurrency(totalPipelineValue)} potenziale`}
        actions={
          <>
            <div className="flex rounded-lg border border-pw-border overflow-hidden">
              <button onClick={() => setView('pipeline')} className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 ${view === 'pipeline' ? 'bg-pw-accent text-[#0A263A]' : 'text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text'}`}>Pipeline</button>
              <button onClick={() => setView('list')} className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 ${view === 'list' ? 'bg-pw-accent text-[#0A263A]' : 'text-pw-text-muted hover:bg-pw-surface-2 hover:text-pw-text'}`}>Lista</button>
            </div>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <Plus size={14} />
              Nuovo Deal
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 stagger-children">
        <Card className="card-accent-top"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-pw-accent font-[var(--font-bebas)] animate-count">{activeDeals.length}</p>
          <p className="text-[10px] text-pw-text-muted uppercase tracking-wider mt-1">Deal attivi</p>
        </CardContent></Card>
        <Card className="card-accent-top"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{formatCurrency(totalPipelineValue)}</p>
          <p className="text-[10px] text-pw-text-muted uppercase tracking-wider mt-1">Valore pipeline</p>
        </CardContent></Card>
        <Card className="card-accent-top"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{formatCurrency(weightedValue)}</p>
          <p className="text-[10px] text-pw-text-muted uppercase tracking-wider mt-1">Valore pesato</p>
        </CardContent></Card>
        <Card className="card-accent-top"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-400 font-[var(--font-bebas)] animate-count">{wonDeals.length}</p>
          <p className="text-[10px] text-pw-text-muted uppercase tracking-wider mt-1">Vinti</p>
        </CardContent></Card>
        <Card className="card-accent-top"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-pw-accent font-[var(--font-bebas)] animate-count">{winRate}%</p>
          <p className="text-[10px] text-pw-text-muted uppercase tracking-wider mt-1">Win rate</p>
        </CardContent></Card>
      </div>

      {/* Pipeline view */}
      {view === 'pipeline' ? (
        activeDeals.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Nessun deal in pipeline"
            description="Crea il tuo primo deal per iniziare a tracciare le opportunità commerciali."
            action={
              <Button variant="primary" onClick={() => setShowForm(true)}>
                <Plus size={14} />
                Nuovo Deal
              </Button>
            }
          />
        ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.filter((s) => s.id !== 'closed_lost').map((stage) => {
            const stageDeals = getDealsForStage(stage.id);
            const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
            return (
              <div key={stage.id} className="flex-shrink-0 w-72">
                {/* Stage header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.bgColor}`} />
                    <span className="text-xs font-semibold text-pw-text">{stage.label}</span>
                    <Badge className="text-[9px]">{stageDeals.length}</Badge>
                  </div>
                  <span className="text-[10px] text-pw-text-dim">{formatCurrency(stageValue)}</span>
                </div>

                {/* Deal cards */}
                <div className="space-y-2 min-h-[200px]">
                  {stageDeals.map((deal) => {
                    const owner = deal.owner as Profile | undefined;
                    return (
                      <div
                        key={deal.id}
                        onClick={() => setSelectedDeal(deal)}
                        className="p-3 rounded-xl bg-pw-surface-2 border border-pw-border hover:border-pw-accent/30 hover:shadow-md transition-all duration-200 ease-out cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-1.5 gap-2">
                          <h4 className="text-sm font-medium text-pw-text line-clamp-1 flex-1">{deal.title}</h4>
                          {deal.priority === 'high' && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-red-500/15 text-red-500 shrink-0" title="Priorità alta">Alta</span>
                          )}
                          {deal.priority === 'low' && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-pw-surface-3 text-pw-text-dim shrink-0" title="Priorità bassa">Bassa</span>
                          )}
                        </div>
                        {deal.company_name && (
                          <p className="text-[10px] text-pw-text-dim flex items-center gap-1 mb-1">
                            <Building2 size={9} />
                            {deal.company_name}
                          </p>
                        )}
                        <p className="text-sm font-bold text-pw-accent mb-2">{formatCurrency(deal.value)}</p>
                        {deal.tags && deal.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {deal.tags.slice(0, 3).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-pw-accent/10 text-pw-accent">{t}</span>
                            ))}
                            {deal.tags.length > 3 && <span className="text-[9px] text-pw-text-dim">+{deal.tags.length - 3}</span>}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {owner && (
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: getUserColor(owner) }}
                                title={owner.full_name}
                              >
                                <span className="text-white text-[7px] font-bold">{getInitials(owner.full_name).charAt(0)}</span>
                              </div>
                            )}
                            <Badge className="text-[8px]">{SOURCE_LABELS[deal.source]}</Badge>
                          </div>
                          {deal.expected_close_date && (
                            <span className="text-[9px] text-pw-text-dim">{formatDate(deal.expected_close_date)}</span>
                          )}
                        </div>
                        {/* Probability bar */}
                        <div className="mt-2 h-1 bg-pw-surface rounded-full overflow-hidden">
                          <div className={`h-full rounded-full progress-animated ${stage.bgColor}`} style={{ width: `${deal.probability}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* List view with search + filter via DataTable */
        <DataTable
          data={deals}
          rowKey={(d) => d.id}
          variant="table"
          onRowClick={(d) => setSelectedDeal(d)}
          searchKeys={[
            (d) => d.title,
            (d) => d.company_name || '',
            (d) => d.contact_name || '',
            (d) => d.contact_email || '',
            (d) => d.contact_phone || '',
            (d) => d.notes || '',
            (d) => (d.tags || []).join(' '),
            (d) => (d.service_categories || []).join(' '),
          ]}
          searchPlaceholder="Cerca per titolo, azienda, contatto, email, telefono, note, tag…"
          filters={[
            {
              key: 'stage',
              label: 'Tutti gli stadi',
              options: STAGES.map((s) => ({ value: s.id, label: s.label })),
              accessor: (d) => d.stage,
            },
            {
              key: 'priority',
              label: 'Tutte le priorità',
              options: [
                { value: 'high', label: 'Alta' },
                { value: 'medium', label: 'Media' },
                { value: 'low', label: 'Bassa' },
              ],
              accessor: (d) => d.priority,
            },
            {
              key: 'owner',
              label: 'Tutti gli owner',
              options: [
                { value: profile?.id || '', label: 'I miei' },
                ...members.map((m) => ({ value: m.id, label: m.full_name })),
              ],
              accessor: (d) => d.owner_id,
            },
            {
              key: 'source',
              label: 'Tutte le origini',
              options: Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l })),
              accessor: (d) => d.source,
            },
          ]}
          columns={[
            {
              key: 'deal',
              label: 'Deal',
              sortable: true,
              sortAccessor: (d) => d.title.toLowerCase(),
              render: (deal) => (
                <div>
                  <p className="font-medium text-pw-text">{deal.title}</p>
                  {deal.contact_name && <p className="text-[10px] text-pw-text-dim">{deal.contact_name}</p>}
                </div>
              ),
            },
            {
              key: 'company',
              label: 'Azienda',
              sortable: true,
              sortAccessor: (d) => (d.company_name || '').toLowerCase(),
              render: (deal) => <span className="text-pw-text-muted">{deal.company_name || '—'}</span>,
            },
            {
              key: 'stage',
              label: 'Stadio',
              sortable: true,
              sortAccessor: (d) => STAGES.findIndex((s) => s.id === d.stage),
              render: (deal) => {
                const stage = STAGES.find((s) => s.id === deal.stage)!;
                return <Badge className={`${stage.color} bg-opacity-10`}>{stage.label}</Badge>;
              },
            },
            {
              key: 'value',
              label: 'Valore',
              sortable: true,
              sortAccessor: (d) => d.value,
              className: 'text-right',
              headerClassName: 'text-right',
              render: (deal) => <span className="font-medium text-pw-text">{formatCurrency(deal.value)}</span>,
            },
            {
              key: 'probability',
              label: 'Prob.',
              sortable: true,
              sortAccessor: (d) => d.probability,
              className: 'text-center',
              headerClassName: 'text-center',
              render: (deal) => <span className="text-pw-text-muted">{deal.probability}%</span>,
            },
            {
              key: 'close',
              label: 'Chiusura',
              sortable: true,
              sortAccessor: (d) => d.expected_close_date || '',
              render: (deal) => (
                <span className="text-pw-text-muted text-xs">
                  {deal.expected_close_date ? formatDate(deal.expected_close_date) : '—'}
                </span>
              ),
            },
          ]}
          emptyState={{
            icon: Target,
            title: 'Nessun deal',
            description: 'Inizia ad aggiungere opportunità alla pipeline per tracciarne il valore.',
            action: (
              <Button variant="primary" onClick={() => setShowForm(true)}>
                <Plus size={14} />
                Nuovo Deal
              </Button>
            ),
          }}
        />
      )}

      {/* Deal detail sidebar */}
      {selectedDeal && (
        <>
        {/* Overlay */}
        <div className="fixed inset-0 bg-black/40 z-40 lg:bg-transparent" onClick={() => setSelectedDeal(null)} />
        <div className="fixed inset-y-0 right-0 w-[90vw] sm:w-[450px] lg:w-[480px] bg-pw-surface border-l border-pw-border shadow-[-8px_0_30px_rgba(0,0,0,0.5)] z-50 overflow-y-auto animate-slide-right">
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-pw-text">{selectedDeal.title}</h2>
                {selectedDeal.company_name && (
                  <p className="text-sm text-pw-text-muted flex items-center gap-1 mt-0.5">
                    <Building2 size={12} />
                    {selectedDeal.company_name}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedDeal(null)} className="p-2 rounded-lg hover:bg-pw-surface-2 text-pw-text-dim">
                <X size={18} />
              </button>
            </div>

            {/* Value & stage */}
            <div className="flex items-center gap-4">
              <p className="text-2xl font-bold text-pw-accent font-[var(--font-bebas)]">{formatCurrency(selectedDeal.value)}</p>
              <Badge className={STAGES.find((s) => s.id === selectedDeal.stage)?.color || ''}>
                {STAGES.find((s) => s.id === selectedDeal.stage)?.label}
              </Badge>
            </div>

            {/* Stage progression */}
            <div>
              <p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-2">Avanza stadio</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGES.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => handleStageChange(selectedDeal.id, stage.id)}
                    disabled={selectedDeal.stage === stage.id}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 ease-out border ${
                      selectedDeal.stage === stage.id
                        ? `${stage.bgColor} text-white border-transparent`
                        : 'border-pw-border text-pw-text-muted hover:border-pw-accent/50 bg-pw-surface-2'
                    }`}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact info */}
            <div className="space-y-2">
              <p className="text-[10px] text-pw-text-dim uppercase tracking-widest">Contatto</p>
              {selectedDeal.contact_name && (
                <p className="text-sm text-pw-text flex items-center gap-2"><Users size={12} className="text-pw-text-dim" />{selectedDeal.contact_name}</p>
              )}
              {selectedDeal.contact_email && (
                <a href={`mailto:${selectedDeal.contact_email}`} className="text-sm text-pw-accent hover:underline flex items-center gap-2"><Mail size={12} />{selectedDeal.contact_email}</a>
              )}
              {selectedDeal.contact_phone && (
                <a href={`tel:${selectedDeal.contact_phone}`} className="text-sm text-pw-text flex items-center gap-2"><Phone size={12} className="text-pw-text-dim" />{selectedDeal.contact_phone}</a>
              )}
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-[10px] text-pw-text-dim">Fonte</p><p className="text-pw-text">{SOURCE_LABELS[selectedDeal.source]}</p></div>
              <div><p className="text-[10px] text-pw-text-dim">Probabilita&apos;</p><p className="text-pw-text">{selectedDeal.probability}%</p></div>
              <div>
                <p className="text-[10px] text-pw-text-dim">Priorità</p>
                <p className="text-pw-text">
                  {selectedDeal.priority === 'high' && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-500">Alta</span>}
                  {selectedDeal.priority === 'medium' && <span className="text-pw-text-muted">Media</span>}
                  {selectedDeal.priority === 'low' && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-pw-surface-3 text-pw-text-dim">Bassa</span>}
                </p>
              </div>
              {selectedDeal.monthly_value && (
                <div><p className="text-[10px] text-pw-text-dim">Valore mensile</p><p className="text-pw-text">{formatCurrency(selectedDeal.monthly_value)}</p></div>
              )}
              {selectedDeal.expected_close_date && (
                <div><p className="text-[10px] text-pw-text-dim">Chiusura prevista</p><p className="text-pw-text">{formatDate(selectedDeal.expected_close_date)}</p></div>
              )}
            </div>

            {selectedDeal.service_categories && selectedDeal.service_categories.length > 0 && (
              <div>
                <p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-2">Servizi richiesti</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDeal.service_categories.map((sv) => {
                    const label = SERVICE_CATEGORIES.find((s) => s.value === sv)?.label || sv;
                    return (
                      <span key={sv} className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-pw-accent/15 text-pw-accent">{label}</span>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedDeal.tags && selectedDeal.tags.length > 0 && (
              <div>
                <p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-2">Tag</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDeal.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-pw-surface-3 text-pw-text-muted">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy services TEXT (deal vecchi creati prima del refactor) */}
            {selectedDeal.services && (
              <div><p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-1">Servizi (legacy)</p><p className="text-sm text-pw-text-muted">{selectedDeal.services}</p></div>
            )}
            {selectedDeal.notes && (
              <div><p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-1">Note</p><p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedDeal.notes}</p></div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => setShowActivity(true)}>
                <Plus size={12} />
                Aggiungi Attivita&apos;
              </Button>
              {selectedDeal.stage !== 'closed_won' && selectedDeal.stage !== 'closed_lost' && (
                <Button size="sm" variant="ghost" onClick={() => handleConvertToClient(selectedDeal)}>
                  <CheckCircle size={12} />
                  Converti in Cliente
                </Button>
              )}
              {(isAdmin || selectedDeal.created_by === profile?.id) && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDeal(selectedDeal)} className="ml-auto">
                    <Pencil size={12} />
                    Modifica
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletingDeal(selectedDeal)} className="text-pw-danger hover:bg-red-500/10">
                    <Trash2 size={12} />
                    Elimina deal
                  </Button>
                </>
              )}
            </div>

            {/* Quick note input */}
            <div>
              <p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-2">Nota rapida</p>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveQuickNote();
                  }
                }}
                placeholder="Scrivi una nota… (Cmd/Ctrl + ⏎ per salvare)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none resize-none"
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="primary" loading={savingNote} disabled={!quickNote.trim()} onClick={handleSaveQuickNote}>
                  <Plus size={12} /> Salva nota
                </Button>
              </div>
            </div>

            {/* Activity timeline */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-pw-text-dim uppercase tracking-widest">Attivita&apos; ({activities.length})</p>
              </div>
              {/* Filter chips */}
              <div className="flex flex-wrap gap-1 mb-3">
                {([
                  { id: 'all', label: 'Tutto' },
                  { id: 'note', label: 'Note' },
                  { id: 'call', label: 'Chiamate' },
                  { id: 'email', label: 'Email' },
                  { id: 'meeting', label: 'Meeting' },
                  { id: 'stage_change', label: 'Stage' },
                ] as const).map((f) => {
                  const active = activityFilter === f.id;
                  const count = f.id === 'all' ? activities.length : activities.filter(a => a.type === f.id).length;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setActivityFilter(f.id as 'all' | DealActivityType)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                        active ? 'bg-pw-accent text-[#0A263A]' : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
                      }`}
                    >
                      {f.label} {count > 0 && <span className="opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Grouped by day */}
              {(() => {
                const filtered = activityFilter === 'all' ? activities : activities.filter(a => a.type === activityFilter);
                if (filtered.length === 0) {
                  return <p className="text-xs text-pw-text-dim text-center py-4">Nessuna attivita&apos; in questa categoria</p>;
                }
                const groups: Record<string, DealActivity[]> = {};
                filtered.forEach((a) => {
                  const day = a.created_at.slice(0, 10);
                  if (!groups[day]) groups[day] = [];
                  groups[day].push(a);
                });
                const today = todayLocal();
                const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
                const dayLabel = (d: string) => d === today ? 'Oggi' : d === yesterday ? 'Ieri' : formatDate(d);
                return Object.keys(groups).sort().reverse().map((day) => (
                  <div key={day} className="mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-pw-text-dim mb-2">{dayLabel(day)}</p>
                    <div className="space-y-2">
                      {groups[day].map((activity) => {
                        const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
                        const canEdit = (activity.created_by === profile?.id || isAdmin) && activity.type !== 'stage_change';
                        const creator = activity.creator as { id: string; full_name: string; color?: string } | undefined;
                        return (
                          <div key={activity.id} className="flex gap-2 group">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                              activity.type === 'stage_change' ? 'bg-pw-accent/20' : 'bg-pw-surface-3'
                            }`}>
                              <Icon size={12} className={activity.type === 'stage_change' ? 'text-pw-accent' : 'text-pw-text-dim'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-pw-text">{activity.title}</p>
                              {activity.description && (
                                <p className="text-xs text-pw-text-muted mt-0.5 whitespace-pre-wrap">{activity.description}</p>
                              )}
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-pw-text-dim">
                                {creator && (
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[7px] font-bold"
                                      style={{ backgroundColor: creator.color || getUserColor({ id: creator.id, color: creator.color } as Profile) }}
                                    >
                                      {getInitials(creator.full_name).charAt(0)}
                                    </span>
                                    {creator.full_name}
                                  </span>
                                )}
                                <span>·</span>
                                <span>{formatDateTime(activity.created_at)}</span>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleStartEditActivity(activity)}
                                  className="p-1 rounded text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2"
                                  aria-label="Modifica"
                                  title="Modifica"
                                >
                                  <Pencil size={11} />
                                </button>
                                <button
                                  onClick={() => setDeletingActivityId(activity.id)}
                                  className="p-1 rounded text-pw-text-dim hover:text-pw-danger hover:bg-pw-surface-2"
                                  aria-label="Elimina"
                                  title="Elimina"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
        </>
      )}

      {/* Create deal modal — state isolato per evitare re-mount dagli effetti della page */}
      <DealForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleCreate}
        members={members}
      />

      {/* Edit deal modal */}
      <DealForm
        open={!!editingDeal}
        onClose={() => setEditingDeal(null)}
        onSubmit={handleUpdateDeal}
        members={members}
        mode="edit"
        initialValues={editingDeal ? {
          title: editingDeal.title,
          company_name: editingDeal.company_name || '',
          contact_name: editingDeal.contact_name || '',
          contact_email: editingDeal.contact_email || '',
          contact_phone: editingDeal.contact_phone || '',
          value: String(editingDeal.value),
          monthly_value: editingDeal.monthly_value != null ? String(editingDeal.monthly_value) : '',
          source: editingDeal.source,
          priority: editingDeal.priority,
          service_categories: editingDeal.service_categories || [],
          tags: editingDeal.tags || [],
          notes: editingDeal.notes || '',
          expected_close_date: editingDeal.expected_close_date || '',
          owner_id: editingDeal.owner_id,
        } : undefined}
      />

      {/* Add activity modal */}
      <ActivityForm
        open={showActivity}
        onClose={() => setShowActivity(false)}
        onSubmit={handleAddActivity}
      />

      <LostReasonForm
        open={showLostReasonModal}
        onClose={() => { setShowLostReasonModal(false); setPendingLostDealId(null); }}
        onConfirm={handleConfirmLostDeal}
      />

      {/* Edit activity modal */}
      <Modal open={!!editingActivity} onClose={() => setEditingActivity(null)} title="Modifica attività" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-pw-text-muted mb-1">Titolo</label>
            <input
              type="text"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-pw-text-muted mb-1">Descrizione</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-sm focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingActivity(null)}>Annulla</Button>
            <Button onClick={handleSaveEditActivity}>Salva</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingActivityId}
        onClose={() => setDeletingActivityId(null)}
        onConfirm={handleDeleteActivity}
        title="Eliminare l'attività?"
        description="L'azione è irreversibile."
        confirmLabel="Elimina"
        variant="danger"
      />

      <ConfirmDialog
        open={!!deletingDeal}
        onClose={() => setDeletingDeal(null)}
        onConfirm={handleDeleteDeal}
        title={deletingDeal ? `Eliminare "${deletingDeal.title}"?` : 'Eliminare il deal?'}
        description="Il deal e tutte le sue attività e note verranno cancellati definitivamente. L'azione è irreversibile."
        confirmLabel="Elimina deal"
        variant="danger"
      />
    </div>
  );
}
