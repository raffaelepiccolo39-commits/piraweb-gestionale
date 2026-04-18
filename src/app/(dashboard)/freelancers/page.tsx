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
import { formatCurrency } from '@/lib/utils';
import { AdminGate } from '@/components/ui/admin-gate';
import type { Freelancer, TaskFreelancerAssignment } from '@/types/database';
import {
  UserPlus,
  Plus,
  Mail,
  Phone,
  ExternalLink,
  Euro,
  Briefcase,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
} from 'lucide-react';

const SPECIALTY_LABELS: Record<string, string> = {
  graphic_designer: 'Graphic Designer',
  copywriter: 'Copywriter',
  video_editor: 'Video Editor',
  photographer: 'Fotografo',
  developer: 'Sviluppatore',
  social_media: 'Social Media',
  seo_specialist: 'SEO Specialist',
  other: 'Altro',
};

const SPECIALTY_OPTIONS = Object.entries(SPECIALTY_LABELS).map(([v, l]) => ({ value: v, label: l }));

export default function FreelancersPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [assignments, setAssignments] = useState<TaskFreelancerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    specialty: 'other',
    hourly_rate: '',
    portfolio_url: '',
    notes: '',
  });

  const fetchFreelancers = useCallback(async () => {
    const { data } = await supabase
      .from('freelancers')
      .select('*')
      .order('full_name');
    setFreelancers((data as Freelancer[]) || []);
  }, [supabase]);

  const fetchAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('task_freelancer_assignments')
      .select('*, freelancer:freelancers(id, full_name), task:tasks(id, title, project:projects(name))')
      .order('created_at', { ascending: false })
      .limit(50);
    setAssignments((data as TaskFreelancerAssignment[]) || []);
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchFreelancers(), fetchAssignments()]).finally(() => setLoading(false));
  }, [fetchFreelancers, fetchAssignments]);

  const handleSave = async () => {
    if (!form.full_name || !form.specialty) {
      toast.error('Nome e specialita\' sono obbligatori');
      return;
    }

    const data = {
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      specialty: form.specialty,
      hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      portfolio_url: form.portfolio_url || null,
      notes: form.notes || null,
    };

    if (editingId) {
      const { error } = await supabase.from('freelancers').update(data).eq('id', editingId);
      if (error) { toast.error('Errore nell\'aggiornamento'); return; }
      toast.success('Freelancer aggiornato');
    } else {
      const { error } = await supabase.from('freelancers').insert({ ...data, created_by: profile!.id });
      if (error) { toast.error('Errore nella creazione'); return; }
      toast.success('Freelancer aggiunto');
    }

    setShowForm(false);
    setEditingId(null);
    setForm({ full_name: '', email: '', phone: '', specialty: 'other', hourly_rate: '', portfolio_url: '', notes: '' });
    fetchFreelancers();
  };

  const handleEdit = (f: Freelancer) => {
    setForm({
      full_name: f.full_name,
      email: f.email || '',
      phone: f.phone || '',
      specialty: f.specialty,
      hourly_rate: f.hourly_rate?.toString() || '',
      portfolio_url: f.portfolio_url || '',
      notes: f.notes || '',
    });
    setEditingId(f.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo freelancer?')) return;
    await supabase.from('freelancers').delete().eq('id', id);
    toast.success('Freelancer eliminato');
    fetchFreelancers();
  };

  const handleToggleActive = async (f: Freelancer) => {
    await supabase.from('freelancers').update({ is_active: !f.is_active }).eq('id', f.id);
    fetchFreelancers();
  };

  // Stats
  const activeFreelancers = freelancers.filter((f) => f.is_active);
  const totalCost = assignments.reduce((sum, a) => sum + (a.total_cost || 0), 0);
  const activeAssignments = assignments.filter((a) => a.status === 'assigned' || a.status === 'in_progress');

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Briefcase size={40} className="mx-auto text-pw-text-dim mb-3" />
          <p className="text-pw-text font-semibold">Accesso non autorizzato</p>
          <p className="text-sm text-pw-text-muted mt-1">Solo gli amministratori possono accedere a questa sezione</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AdminGate>
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
            <Briefcase size={24} className="text-pw-accent" />
            Freelancer
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">Gestisci collaboratori esterni e relativi costi</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditingId(null); setForm({ full_name: '', email: '', phone: '', specialty: 'other', hourly_rate: '', portfolio_url: '', notes: '' }); setShowForm(true); }}>
            <Plus size={16} />
            Aggiungi Freelancer
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{activeFreelancers.length}</p>
            <p className="text-xs text-pw-text-muted">Freelancer attivi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{activeAssignments.length}</p>
            <p className="text-xs text-pw-text-muted">Task assegnate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">{formatCurrency(totalCost)}</p>
            <p className="text-xs text-pw-text-muted">Costo totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count">
              {new Set(freelancers.map((f) => f.specialty)).size}
            </p>
            <p className="text-xs text-pw-text-muted">Specialita'</p>
          </CardContent>
        </Card>
      </div>

      {/* Freelancer grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {freelancers.map((f) => {
          const fAssignments = assignments.filter((a) => a.freelancer_id === f.id);
          const fCost = fAssignments.reduce((sum, a) => sum + (a.total_cost || 0), 0);
          const fActiveCount = fAssignments.filter((a) => a.status !== 'completed' && a.status !== 'cancelled').length;

          return (
            <Card key={f.id} className={!f.is_active ? 'opacity-50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-pw-text">{f.full_name}</h3>
                    <Badge className="mt-1 text-[10px]">
                      {SPECIALTY_LABELS[f.specialty] || f.specialty}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(f)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-pw-accent hover:bg-pw-surface-2">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-pw-text-muted">
                  {f.hourly_rate && (
                    <p className="flex items-center gap-1.5">
                      <Euro size={11} />
                      {formatCurrency(f.hourly_rate)}/h
                    </p>
                  )}
                  {f.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail size={11} />
                      <a href={`mailto:${f.email}`} className="hover:text-pw-accent truncate">{f.email}</a>
                    </p>
                  )}
                  {f.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={11} />
                      {f.phone}
                    </p>
                  )}
                  {f.portfolio_url && (
                    <a href={f.portfolio_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-pw-accent hover:underline">
                      <ExternalLink size={11} />
                      Portfolio
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-pw-border">
                  <span className="text-[10px] text-pw-text-dim">
                    {fActiveCount > 0 ? (
                      <span className="flex items-center gap-1"><Clock size={9} /> {fActiveCount} task attive</span>
                    ) : (
                      <span className="flex items-center gap-1"><CheckCircle size={9} /> Disponibile</span>
                    )}
                  </span>
                  {fCost > 0 && (
                    <span className="text-[10px] font-medium text-pw-text">{formatCurrency(fCost)} totale</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {freelancers.length === 0 && (
        <div className="text-center py-12">
          <Briefcase size={48} className="text-pw-text-dim mx-auto mb-3" />
          <p className="text-pw-text-muted">Nessun freelancer registrato</p>
          <p className="text-xs text-pw-text-dim mt-1">Aggiungi collaboratori esterni per tracciare costi e assegnazioni</p>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditingId(null); }} title={editingId ? 'Modifica Freelancer' : 'Nuovo Freelancer'}>
        <div className="space-y-4">
          <Input label="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Mario Rossi" required />
          <Select label="Specialita'" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} options={SPECIALTY_OPTIONS} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            <Input label="Telefono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+39 333..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Tariffa oraria (€)" type="number" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} placeholder="35" />
            <Input label="Portfolio URL" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} placeholder="https://behance.net/..." />
          </div>
          <Textarea label="Note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Competenze specifiche, disponibilita'..." rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Annulla</Button>
            <Button onClick={handleSave}>{editingId ? 'Aggiorna' : 'Aggiungi'}</Button>
          </div>
        </div>
      </Modal>
    </div>
    </AdminGate>
  );
}
