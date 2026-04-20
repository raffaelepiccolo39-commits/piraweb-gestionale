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
import { PageHeader } from '@/components/ui/page-header';
import { formatCurrency, formatDate, formatDateTime, getInitials, getUserColor } from '@/lib/utils';
import type { Deal, DealStage, DealActivity, Profile } from '@/types/database';
import {
  Plus,
  Users,
  Euro,
  TrendingUp,
  Phone,
  Mail,
  Calendar,
  Building2,
  ArrowRight,
  CheckCircle,
  XCircle,
  MessageSquare,
  PhoneCall,
  Video,
  FileText,
  Clock,
  Target,
  ChevronRight,
  X,
} from 'lucide-react';

const STAGES: { id: DealStage; label: string; color: string; bgColor: string }[] = [
  { id: 'lead', label: 'Lead', color: 'text-pw-text-dim', bgColor: 'bg-gray-500' },
  { id: 'qualified', label: 'Qualificato', color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { id: 'proposal', label: 'Proposta', color: 'text-purple-500', bgColor: 'bg-purple-500' },
  { id: 'negotiation', label: 'Negoziazione', color: 'text-orange-500', bgColor: 'bg-orange-500' },
  { id: 'closed_won', label: 'Chiuso Vinto', color: 'text-green-500', bgColor: 'bg-green-500' },
  { id: 'closed_lost', label: 'Chiuso Perso', color: 'text-red-500', bgColor: 'bg-red-500' },
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
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');

  // Lost reason modal (replaces prompt())
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingLostDealId, setPendingLostDealId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    title: '', company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    value: '', monthly_value: '', source: 'other', services: '', notes: '',
    expected_close_date: '', owner_id: '',
  });

  const [activityForm, setActivityForm] = useState({
    type: 'note' as string, title: '', description: '', scheduled_at: '',
  });

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

  const handleCreate = async () => {
    if (!form.title) { toast.error('Titolo obbligatorio'); return; }
    const { error } = await supabase.from('deals').insert({
      title: form.title,
      company_name: form.company_name || null,
      contact_name: form.contact_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      value: parseFloat(form.value) || 0,
      monthly_value: form.monthly_value ? parseFloat(form.monthly_value) : null,
      source: form.source,
      services: form.services || null,
      notes: form.notes || null,
      expected_close_date: form.expected_close_date || null,
      owner_id: form.owner_id || profile!.id,
      created_by: profile!.id,
    });
    if (!error) {
      toast.success('Deal creato');
      setShowForm(false);
      setForm({ title: '', company_name: '', contact_name: '', contact_email: '', contact_phone: '', value: '', monthly_value: '', source: 'other', services: '', notes: '', expected_close_date: '', owner_id: '' });
      fetchDeals();
    }
  };

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    if (newStage === 'closed_lost') {
      setPendingLostDealId(dealId);
      setLostReason('');
      setShowLostReasonModal(true);
      return;
    }

    await supabase.from('deals').update({ stage: newStage }).eq('id', dealId);
    toast.success(`Deal spostato a: ${STAGES.find((s) => s.id === newStage)?.label}`);
    fetchDeals();
    if (selectedDeal?.id === dealId) {
      setSelectedDeal((d) => d ? { ...d, stage: newStage } : null);
      fetchActivities(dealId);
    }
  };

  const handleConfirmLostDeal = async () => {
    if (!pendingLostDealId) return;
    const updates: Record<string, unknown> = {
      stage: 'closed_lost',
      lost_reason: lostReason.trim() || null,
    };
    await supabase.from('deals').update(updates).eq('id', pendingLostDealId);
    toast.success(`Deal spostato a: ${STAGES.find((s) => s.id === 'closed_lost')?.label}`);
    setShowLostReasonModal(false);
    setPendingLostDealId(null);
    setLostReason('');
    fetchDeals();
    if (selectedDeal?.id === pendingLostDealId) {
      setSelectedDeal((d) => d ? { ...d, stage: 'closed_lost' as DealStage } : null);
      fetchActivities(pendingLostDealId);
    }
  };

  const handleAddActivity = async () => {
    if (!activityForm.title || !selectedDeal) return;
    await supabase.from('deal_activities').insert({
      deal_id: selectedDeal.id,
      type: activityForm.type,
      title: activityForm.title,
      description: activityForm.description || null,
      scheduled_at: activityForm.scheduled_at || null,
      created_by: profile!.id,
    });
    setShowActivity(false);
    setActivityForm({ type: 'note', title: '', description: '', scheduled_at: '' });
    fetchActivities(selectedDeal.id);
  };

  const handleConvertToClient = async (deal: Deal) => {
    // Create client from deal
    const { data: client, error } = await supabase.from('clients').insert({
      name: deal.contact_name || deal.title,
      company: deal.company_name || null,
      email: deal.contact_email || null,
      phone: deal.contact_phone || null,
      notes: `Convertito da deal: ${deal.title}\n${deal.notes || ''}`,
      created_by: profile!.id,
    }).select('id').single();

    if (!error && client) {
      await supabase.from('deals').update({
        converted_client_id: client.id,
        stage: 'closed_won',
      }).eq('id', deal.id);
      toast.success('Deal convertito in cliente!');
      fetchDeals();
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

  const getDealsForStage = (stage: DealStage) => deals.filter((d) => d.stage === stage);

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
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
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
                        <div className="flex items-start justify-between mb-1.5">
                          <h4 className="text-sm font-medium text-pw-text line-clamp-1">{deal.title}</h4>
                        </div>
                        {deal.company_name && (
                          <p className="text-[10px] text-pw-text-dim flex items-center gap-1 mb-1">
                            <Building2 size={9} />
                            {deal.company_name}
                          </p>
                        )}
                        <p className="text-sm font-bold text-pw-accent mb-2">{formatCurrency(deal.value)}</p>
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
      ) : (
        /* List view */
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pw-border">
                  <th className="text-left px-4 py-3 text-xs text-pw-text-muted">Deal</th>
                  <th className="text-left px-4 py-3 text-xs text-pw-text-muted">Azienda</th>
                  <th className="text-left px-4 py-3 text-xs text-pw-text-muted">Stadio</th>
                  <th className="text-right px-4 py-3 text-xs text-pw-text-muted">Valore</th>
                  <th className="text-center px-4 py-3 text-xs text-pw-text-muted">Prob.</th>
                  <th className="text-left px-4 py-3 text-xs text-pw-text-muted">Chiusura</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const stage = STAGES.find((s) => s.id === deal.stage)!;
                  return (
                    <tr key={deal.id} onClick={() => setSelectedDeal(deal)} className="border-b border-pw-border/50 row-hover cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="font-medium text-pw-text">{deal.title}</p>
                        {deal.contact_name && <p className="text-[10px] text-pw-text-dim">{deal.contact_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-pw-text-muted">{deal.company_name || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${stage.color} bg-opacity-10`}>{stage.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-pw-text">{formatCurrency(deal.value)}</td>
                      <td className="px-4 py-3 text-center text-pw-text-muted">{deal.probability}%</td>
                      <td className="px-4 py-3 text-pw-text-muted text-xs">{deal.expected_close_date ? formatDate(deal.expected_close_date) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
              <div><p className="text-[10px] text-pw-text-dim">Probabilita'</p><p className="text-pw-text">{selectedDeal.probability}%</p></div>
              {selectedDeal.monthly_value && (
                <div><p className="text-[10px] text-pw-text-dim">Valore mensile</p><p className="text-pw-text">{formatCurrency(selectedDeal.monthly_value)}</p></div>
              )}
              {selectedDeal.expected_close_date && (
                <div><p className="text-[10px] text-pw-text-dim">Chiusura prevista</p><p className="text-pw-text">{formatDate(selectedDeal.expected_close_date)}</p></div>
              )}
            </div>

            {selectedDeal.services && (
              <div><p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-1">Servizi richiesti</p><p className="text-sm text-pw-text-muted">{selectedDeal.services}</p></div>
            )}
            {selectedDeal.notes && (
              <div><p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-1">Note</p><p className="text-sm text-pw-text-muted whitespace-pre-wrap">{selectedDeal.notes}</p></div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowActivity(true)}>
                <Plus size={12} />
                Aggiungi Attivita'
              </Button>
              {selectedDeal.stage !== 'closed_won' && selectedDeal.stage !== 'closed_lost' && (
                <Button size="sm" variant="ghost" onClick={() => handleConvertToClient(selectedDeal)}>
                  <CheckCircle size={12} />
                  Converti in Cliente
                </Button>
              )}
            </div>

            {/* Activity timeline */}
            <div>
              <p className="text-[10px] text-pw-text-dim uppercase tracking-widest mb-3">Attivita' ({activities.length})</p>
              <div className="space-y-3">
                {activities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        activity.type === 'stage_change' ? 'bg-pw-accent/20' : 'bg-pw-surface-3'
                      }`}>
                        <Icon size={12} className={activity.type === 'stage_change' ? 'text-pw-accent' : 'text-pw-text-dim'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-pw-text">{activity.title}</p>
                        {activity.description && (
                          <p className="text-xs text-pw-text-muted mt-0.5">{activity.description}</p>
                        )}
                        <p className="text-[10px] text-pw-text-dim mt-0.5">
                          {formatDateTime(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {activities.length === 0 && (
                  <p className="text-xs text-pw-text-dim text-center py-4">Nessuna attivita' ancora</p>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Create deal modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuovo Deal">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input label="Titolo deal" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Es: Gestione social per Acme Corp" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Azienda" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Acme Corp" />
            <Input label="Nome contatto" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Mario Rossi" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="mario@acme.com" />
            <Input label="Telefono" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+39 333..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valore deal (€)" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="5000" />
            <Input label="Valore mensile (€)" type="number" value={form.monthly_value} onChange={(e) => setForm({ ...form, monthly_value: e.target.value })} placeholder="500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Fonte" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} options={Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            <Input label="Chiusura prevista" type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
          </div>
          <Select label="Assegnato a" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} options={[{ value: '', label: 'Me stesso' }, ...members.map((m) => ({ value: m.id, label: m.full_name }))]} />
          <Textarea label="Servizi richiesti" value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} placeholder="Social media management, branding, sito web..." rows={2} />
          <Textarea label="Note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Annulla</Button>
            <Button onClick={handleCreate}>Crea Deal</Button>
          </div>
        </div>
      </Modal>

      {/* Add activity modal */}
      <Modal open={showActivity} onClose={() => setShowActivity(false)} title="Nuova Attivita'">
        <div className="space-y-4">
          <Select label="Tipo" value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })} options={[
            { value: 'call', label: 'Chiamata' },
            { value: 'email', label: 'Email' },
            { value: 'meeting', label: 'Meeting' },
            { value: 'note', label: 'Nota' },
            { value: 'proposal_sent', label: 'Proposta inviata' },
            { value: 'follow_up', label: 'Follow-up' },
          ]} />
          <Input label="Titolo" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} placeholder="Es: Call conoscitiva" required />
          <Textarea label="Dettagli" value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} rows={2} />
          <Input label="Data/ora (opzionale)" type="datetime-local" value={activityForm.scheduled_at} onChange={(e) => setActivityForm({ ...activityForm, scheduled_at: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowActivity(false)}>Annulla</Button>
            <Button onClick={handleAddActivity}>Salva</Button>
          </div>
        </div>
      </Modal>

      {/* Lost Reason Modal */}
      <Modal
        open={showLostReasonModal}
        onClose={() => { setShowLostReasonModal(false); setPendingLostDealId(null); }}
        title="Deal perso"
        size="sm"
      >
        <div className="space-y-4">
          <Textarea
            id="lost-reason"
            label="Motivo della perdita (opzionale)"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Es: Budget insufficiente, scelto competitor..."
            rows={3}
          />
          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => { setShowLostReasonModal(false); setPendingLostDealId(null); }}
              className="flex-1"
            >
              Annulla
            </Button>
            <Button
              onClick={handleConfirmLostDeal}
              className="flex-1"
            >
              <XCircle size={14} />
              Conferma
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
