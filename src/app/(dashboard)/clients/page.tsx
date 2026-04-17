'use client';


import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientForm, type ClientFormData } from '@/components/clients/client-form';
import type { Client } from '@/types/database';
import { useToast } from '@/components/ui/toast';
import {
  Plus,
  Search,
  Users,
  Pencil,
  Trash2,
  Globe,
  Mail,
  Phone,
  Building2,
  Eye,
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  Briefcase,
  CalendarDays,
  Filter,
  Tag,
} from 'lucide-react';

export default function ClientsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();
  const [editingMonthlyFee, setEditingMonthlyFee] = useState<number | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [sectorFilter, setSectorFilter] = useState('');
  const [error, setError] = useState(false);
  const [paymentAlerts, setPaymentAlerts] = useState<Record<string, 'warning' | 'danger'>>({});

  const router = useRouter();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const fetchClients = useCallback(async () => {
    try {
      const query = supabase
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('name');
      const { data, error } = await query;
      if (error) throw error;
      setClients((data as Client[]) || []);

      // Fetch unpaid payments for current month to show alerts
      if (profile?.role === 'admin') {
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);
        const { data: unpaidPayments } = await supabase
          .from('client_payments')
          .select('id, contract_id, due_date, is_paid, contract:client_contracts!client_payments_contract_id_fkey(client_id)')
          .eq('is_paid', false)
          .gte('due_date', `${currentMonth}-01`)
          .lte('due_date', `${currentMonth}-31`);

        if (unpaidPayments) {
          const dayOfMonth = now.getDate();
          const alerts: Record<string, 'warning' | 'danger'> = {};
          for (const p of unpaidPayments) {
            const clientId = (p.contract as { client_id: string } | null)?.client_id;
            if (!clientId) continue;
            if (dayOfMonth > 15) {
              alerts[clientId] = 'danger';
            } else if (dayOfMonth >= 1 && !alerts[clientId]) {
              alerts[clientId] = 'warning';
            }
          }
          setPaymentAlerts(alerts);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile?.role]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Extract unique sectors for filter dropdown
  const sectors = [...new Set(clients.map((c) => c.sector).filter(Boolean))] as string[];

  const filteredClients = clients
    .filter(
      (c) =>
        (c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.toLowerCase().includes(search.toLowerCase()) ||
        (isAdmin && c.email?.toLowerCase().includes(search.toLowerCase()))) &&
        (!sectorFilter || c.sector === sectorFilter)
    )
    .sort((a, b) => {
      const nameA = (a.company || a.name).toLowerCase();
      const nameB = (b.company || b.name).toLowerCase();
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });

  const uploadLogo = async (file: File, clientId: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const fileName = `${clientId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('client-logos').upload(fileName, file);
    if (error) return null;
    const { data } = supabase.storage.from('client-logos').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleCreate = async (data: ClientFormData) => {
    try {
      const { logo, ...fields } = data;
      const { data: newClient, error } = await supabase.from('clients').insert({
        ...fields,
        created_by: profile!.id,
      }).select().single();
      if (!error && newClient && logo) {
        const logoUrl = await uploadLogo(logo, newClient.id);
        if (logoUrl) {
          await supabase.from('clients').update({ logo_url: logoUrl }).eq('id', newClient.id);
        }
      }
      if (error) throw error;

      // Auto-create projects based on selected services
      if (newClient && fields.service_types) {
        const services = fields.service_types.split(',').map(s => s.trim()).filter(Boolean);
        await createProjectsForServices(newClient.id, newClient.name || newClient.company || '', services);
      }

      setShowForm(false);
      toast.success('Cliente creato con successo');
      fetchClients();
    } catch {
      toast.error('Errore durante la creazione del cliente');
    }
  };

  const SERVICE_PROJECT_CONFIG: Record<string, { name: string; color: string; tasks: { title: string; priority: string; estimated_hours: number; role: string }[] }> = {
    gestione_social: {
      name: 'Gestione Social Media',
      color: '#ec4899',
      tasks: [
        { title: 'Raccolta brief e brand guidelines', priority: 'high', estimated_hours: 2, role: 'admin' },
        { title: 'Setup credenziali social', priority: 'high', estimated_hours: 1, role: 'social_media_manager' },
        { title: 'Analisi competitor sui social', priority: 'medium', estimated_hours: 4, role: 'social_media_manager' },
        { title: 'Definizione strategia editoriale', priority: 'high', estimated_hours: 6, role: 'social_media_manager' },
        { title: 'Creazione piano editoriale mese 1', priority: 'high', estimated_hours: 4, role: 'content_creator' },
        { title: 'Design template grafici social', priority: 'high', estimated_hours: 8, role: 'graphic_social' },
        { title: 'Produzione contenuti settimana 1', priority: 'medium', estimated_hours: 6, role: 'content_creator' },
        { title: 'Review e approvazione cliente', priority: 'high', estimated_hours: 2, role: 'admin' },
      ],
    },
    gestione_full: {
      name: 'Gestione Full (Social + E-commerce)',
      color: '#8b5cf6',
      tasks: [
        { title: 'Raccolta brief completo', priority: 'high', estimated_hours: 3, role: 'admin' },
        { title: 'Setup credenziali social + e-commerce', priority: 'high', estimated_hours: 2, role: 'social_media_manager' },
        { title: 'Analisi competitor e mercato', priority: 'high', estimated_hours: 6, role: 'social_media_manager' },
        { title: 'Strategia social media', priority: 'high', estimated_hours: 6, role: 'social_media_manager' },
        { title: 'Strategia e-commerce e catalogo', priority: 'high', estimated_hours: 8, role: 'admin' },
        { title: 'Piano editoriale integrato', priority: 'high', estimated_hours: 5, role: 'content_creator' },
        { title: 'Design template social + banner e-commerce', priority: 'high', estimated_hours: 10, role: 'graphic_social' },
        { title: 'Setup campagne ADV social + shopping', priority: 'medium', estimated_hours: 6, role: 'social_media_manager' },
        { title: 'Produzione contenuti mese 1', priority: 'medium', estimated_hours: 8, role: 'content_creator' },
        { title: 'Review e approvazione cliente', priority: 'high', estimated_hours: 2, role: 'admin' },
      ],
    },
    sito_web: {
      name: 'Sviluppo Sito Web',
      color: '#3b82f6',
      tasks: [
        { title: 'Raccolta requisiti e brief', priority: 'high', estimated_hours: 3, role: 'admin' },
        { title: 'Analisi competitor e benchmark', priority: 'medium', estimated_hours: 4, role: 'content_creator' },
        { title: 'Wireframe e struttura pagine', priority: 'high', estimated_hours: 6, role: 'graphic_brand' },
        { title: 'Design UI mockup', priority: 'high', estimated_hours: 12, role: 'graphic_brand' },
        { title: 'Approvazione design dal cliente', priority: 'high', estimated_hours: 2, role: 'admin' },
        { title: 'Sviluppo sito', priority: 'high', estimated_hours: 20, role: 'admin' },
        { title: 'Copywriting pagine', priority: 'medium', estimated_hours: 6, role: 'content_creator' },
        { title: 'SEO on-page', priority: 'medium', estimated_hours: 4, role: 'content_creator' },
        { title: 'Test e QA', priority: 'high', estimated_hours: 4, role: 'admin' },
        { title: 'Go live e consegna', priority: 'high', estimated_hours: 2, role: 'admin' },
      ],
    },
    ecommerce: {
      name: 'Sviluppo E-Commerce',
      color: '#f59e0b',
      tasks: [
        { title: 'Raccolta requisiti e catalogo prodotti', priority: 'high', estimated_hours: 4, role: 'admin' },
        { title: 'Scelta piattaforma e setup', priority: 'high', estimated_hours: 6, role: 'admin' },
        { title: 'Design UI e-commerce', priority: 'high', estimated_hours: 14, role: 'graphic_brand' },
        { title: 'Sviluppo e configurazione shop', priority: 'high', estimated_hours: 24, role: 'admin' },
        { title: 'Caricamento prodotti e foto', priority: 'medium', estimated_hours: 8, role: 'content_creator' },
        { title: 'Setup pagamenti e spedizioni', priority: 'high', estimated_hours: 4, role: 'admin' },
        { title: 'SEO prodotti', priority: 'medium', estimated_hours: 6, role: 'content_creator' },
        { title: 'Test ordini e checkout', priority: 'high', estimated_hours: 4, role: 'admin' },
        { title: 'Go live e formazione cliente', priority: 'high', estimated_hours: 3, role: 'admin' },
      ],
    },
    foto: {
      name: 'Servizio Fotografico',
      color: '#10b981',
      tasks: [
        { title: 'Brief fotografico e mood board', priority: 'high', estimated_hours: 2, role: 'admin' },
        { title: 'Organizzazione shooting (location, props)', priority: 'medium', estimated_hours: 3, role: 'admin' },
        { title: 'Shooting fotografico', priority: 'high', estimated_hours: 4, role: 'graphic_brand' },
        { title: 'Post-produzione e ritocco', priority: 'high', estimated_hours: 6, role: 'graphic_brand' },
        { title: 'Consegna e selezione con cliente', priority: 'medium', estimated_hours: 2, role: 'admin' },
      ],
    },
    branding: {
      name: 'Branding / Logo Design',
      color: '#6366f1',
      tasks: [
        { title: 'Brief di branding e analisi valori', priority: 'high', estimated_hours: 3, role: 'admin' },
        { title: 'Ricerca e moodboard', priority: 'medium', estimated_hours: 4, role: 'graphic_brand' },
        { title: 'Proposte logo (3 concept)', priority: 'high', estimated_hours: 10, role: 'graphic_brand' },
        { title: 'Revisioni e finalizzazione', priority: 'high', estimated_hours: 6, role: 'graphic_brand' },
        { title: 'Brand guidelines document', priority: 'medium', estimated_hours: 8, role: 'graphic_brand' },
        { title: 'Consegna file e declinazioni', priority: 'medium', estimated_hours: 3, role: 'graphic_brand' },
      ],
    },
    advertising: {
      name: 'Campagne Advertising',
      color: '#ef4444',
      tasks: [
        { title: 'Definizione obiettivi e budget', priority: 'high', estimated_hours: 2, role: 'admin' },
        { title: 'Setup Business Manager e Pixel', priority: 'high', estimated_hours: 3, role: 'social_media_manager' },
        { title: 'Creazione audience e targeting', priority: 'high', estimated_hours: 4, role: 'social_media_manager' },
        { title: 'Design creativita\' ADV', priority: 'high', estimated_hours: 6, role: 'graphic_social' },
        { title: 'Copywriting annunci', priority: 'medium', estimated_hours: 3, role: 'content_creator' },
        { title: 'Lancio campagne', priority: 'high', estimated_hours: 3, role: 'social_media_manager' },
        { title: 'Monitoraggio e ottimizzazione settimanale', priority: 'medium', estimated_hours: 4, role: 'social_media_manager' },
        { title: 'Report risultati mese 1', priority: 'medium', estimated_hours: 3, role: 'social_media_manager' },
      ],
    },
    seo: {
      name: 'Ottimizzazione SEO',
      color: '#22d3ee',
      tasks: [
        { title: 'Audit SEO sito attuale', priority: 'high', estimated_hours: 6, role: 'content_creator' },
        { title: 'Ricerca keyword', priority: 'high', estimated_hours: 4, role: 'content_creator' },
        { title: 'Ottimizzazione on-page', priority: 'high', estimated_hours: 8, role: 'content_creator' },
        { title: 'Setup Google Search Console + Analytics', priority: 'medium', estimated_hours: 2, role: 'content_creator' },
        { title: 'Strategia link building', priority: 'medium', estimated_hours: 4, role: 'content_creator' },
        { title: 'Report posizionamento mese 1', priority: 'medium', estimated_hours: 3, role: 'content_creator' },
      ],
    },
    video: {
      name: 'Produzione Video / Reel',
      color: '#f97316',
      tasks: [
        { title: 'Brief video e concept', priority: 'high', estimated_hours: 2, role: 'admin' },
        { title: 'Storyboard e script', priority: 'high', estimated_hours: 4, role: 'content_creator' },
        { title: 'Shooting video', priority: 'high', estimated_hours: 4, role: 'graphic_social' },
        { title: 'Montaggio e post-produzione', priority: 'high', estimated_hours: 8, role: 'graphic_social' },
        { title: 'Revisioni e consegna', priority: 'medium', estimated_hours: 3, role: 'admin' },
      ],
    },
  };

  const createProjectsForServices = async (clientId: string, clientName: string, services: string[]) => {
    // Pre-fetch all active profiles once to avoid N+1 queries per task
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('is_active', true);
    const profilesByRole = new Map<string, string>();
    (activeProfiles || []).forEach((p) => {
      if (!profilesByRole.has(p.role)) profilesByRole.set(p.role, p.id);
    });

    for (const service of services) {
      const config = SERVICE_PROJECT_CONFIG[service];
      if (!config) continue;

      // Create project
      const { data: project, error: projError } = await supabase.from('projects').insert({
        name: `${config.name} - ${clientName}`,
        client_id: clientId,
        status: 'active',
        color: config.color,
        created_by: profile!.id,
      }).select('id').single();

      if (projError || !project) continue;

      // Add creator as member
      await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: profile!.id,
      });

      // Collect unique members and batch-insert tasks
      const memberIds = new Set<string>();
      const taskInserts = config.tasks.map((task, i) => {
        const assignedTo = profilesByRole.get(task.role) || null;
        if (assignedTo) memberIds.add(assignedTo);
        return {
          title: task.title,
          project_id: project.id,
          assigned_to: assignedTo,
          priority: task.priority,
          estimated_hours: task.estimated_hours,
          position: i,
          status: 'backlog' as const,
          created_by: profile!.id,
        };
      });

      // Batch insert: members and tasks in parallel
      await Promise.all([
        memberIds.size > 0
          ? supabase.from('project_members').insert(
              Array.from(memberIds).map((uid) => ({ project_id: project.id, user_id: uid }))
            )
          : Promise.resolve(),
        supabase.from('tasks').insert(taskInserts),
      ]);
    }
  };

  const handleUpdate = async (data: ClientFormData) => {
    if (!editingClient) return;
    try {
      const { logo, monthly_fee, ...fields } = data;
      let logoUrl = editingClient.logo_url;
      if (logo) {
        const uploaded = await uploadLogo(logo, editingClient.id);
        if (uploaded) logoUrl = uploaded;
      }
      const { error } = await supabase
        .from('clients')
        .update({ ...fields, logo_url: logoUrl })
        .eq('id', editingClient.id);
      if (error) throw error;

      // Update monthly fee on active contract if changed
      if (monthly_fee !== undefined && monthly_fee !== editingMonthlyFee) {
        const { data: activeContract } = await supabase
          .from('client_contracts')
          .select('id')
          .eq('client_id', editingClient.id)
          .eq('status', 'active')
          .maybeSingle();
        if (activeContract) {
          await supabase
            .from('client_contracts')
            .update({ monthly_fee })
            .eq('id', activeContract.id);
          // Update future unpaid payments
          await supabase
            .from('client_payments')
            .update({ amount: monthly_fee })
            .eq('contract_id', activeContract.id)
            .eq('is_paid', false);
        }
      }

      setEditingClient(undefined);
      setEditingMonthlyFee(undefined);
      toast.success('Cliente aggiornato con successo');
      fetchClients();
    } catch {
      toast.error('Errore durante l\'aggiornamento del cliente');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      toast.success('Cliente eliminato con successo');
      fetchClients();
    } catch {
      toast.error('Errore durante l\'eliminazione del cliente');
    }
  };

  const handleToggleActive = async (client: Client) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ is_active: !client.is_active })
        .eq('id', client.id);
      if (error) throw error;
      toast.success(client.is_active ? 'Cliente disattivato' : 'Cliente attivato');
      fetchClients();
    } catch {
      toast.error('Errore durante l\'aggiornamento dello stato');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchClients(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Clienti
          </h1>
          <p className="text-sm text-pw-text-muted">
            {clients.length} clienti {isAdmin ? 'totali' : 'attivi'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm(true)}>
            <Plus size={18} />
            Nuovo Cliente
          </Button>
        )}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-pw-text-dim" />
          <input
            type="text"
            placeholder="Cerca clienti..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
          />
        </div>
        {sectors.length > 0 && (
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pw-text-dim pointer-events-none" />
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="pl-9 pr-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text text-sm outline-none appearance-none cursor-pointer"
            >
              <option value="">Tutti i settori</option>
              {sectors.sort().map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          title={sortOrder === 'asc' ? 'Ordine A-Z' : 'Ordine Z-A'}
        >
          {sortOrder === 'asc' ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}
          {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
        </Button>
      </div>

      {/* Client grid */}
      {filteredClients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nessun cliente"
          description={search ? 'Nessun risultato per la ricerca' : 'Nessun cliente disponibile'}
          action={
            isAdmin && !search ? (
              <Button onClick={() => setShowForm(true)}>
                <Plus size={18} />
                Nuovo Cliente
              </Button>
            ) : undefined
          }
        />
      ) : isAdmin ? (
        /* ===== VISTA ADMIN: card completa ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {filteredClients.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {client.logo_url ? (
                      <div className="w-10 h-10 rounded-xl border border-pw-border overflow-hidden bg-white shrink-0">
                        <Image src={client.logo_url} alt={client.name} width={40} height={40} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-pw-surface-3 flex items-center justify-center shrink-0">
                        <Building2 size={20} className="text-pw-accent" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-pw-text">
                        {client.company || client.name}
                      </h3>
                      <p className="text-xs text-pw-text-muted mt-0.5">
                        Ref. {client.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {paymentAlerts[client.id] === 'warning' && (
                      <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center" title="Pagamento non ancora ricevuto">
                        <AlertTriangle size={14} className="text-amber-400" />
                      </div>
                    )}
                    {paymentAlerts[client.id] === 'danger' && (
                      <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center" title="Pagamento in ritardo">
                        <span className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                    <Badge
                      className={
                        client.is_active
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-pw-surface-3 text-pw-text-dim'
                      }
                    >
                      {client.is_active ? 'Attivo' : 'Inattivo'}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  {client.email && (
                    <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                      <Mail size={14} />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                      <Phone size={14} />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.website && (
                    <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                      <Globe size={14} />
                      <span className="truncate">{client.website}</span>
                    </div>
                  )}
                </div>

                {(client.sector || client.service_types || client.relationship_start) && (
                  <div className="space-y-1.5 mb-4">
                    {client.sector && (
                      <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                        <Tag size={14} />
                        <span className="truncate">{client.sector}</span>
                      </div>
                    )}
                    {client.service_types && (
                      <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                        <Briefcase size={14} />
                        <span className="truncate">{client.service_types}</span>
                      </div>
                    )}
                    {client.relationship_start && (
                      <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                        <CalendarDays size={14} />
                        <span>Dal {new Date(client.relationship_start).toLocaleDateString('it-IT')}</span>
                      </div>
                    )}
                  </div>
                )}

                {client.notes && (
                  <p className="text-sm text-pw-text-muted line-clamp-2 mb-4">
                    {client.notes}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-pw-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/clients/${client.id}`)}
                  >
                    <Eye size={14} />
                    Dettagli
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setEditingClient(client);
                      const { data: activeContract } = await supabase
                        .from('client_contracts')
                        .select('monthly_fee')
                        .eq('client_id', client.id)
                        .eq('status', 'active')
                        .maybeSingle();
                      setEditingMonthlyFee(activeContract?.monthly_fee ?? undefined);
                    }}
                  >
                    <Pencil size={14} />
                    Modifica
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(client)}
                  >
                    {client.is_active ? 'Disattiva' : 'Attiva'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={() => setDeleteConfirm(client.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ===== VISTA DIPENDENTE: solo azienda e referente ===== */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {filteredClients.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  {client.logo_url ? (
                    <div className="w-10 h-10 rounded-xl border border-pw-border overflow-hidden bg-white shrink-0">
                      <Image src={client.logo_url} alt={client.company || client.name} width={40} height={40} className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-pw-surface-3 flex items-center justify-center shrink-0">
                      <Building2 size={20} className="text-pw-accent" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-pw-text">
                      {client.company || client.name}
                    </h3>
                    <p className="text-xs text-pw-text-muted mt-0.5">
                      Ref. {client.name}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal (admin only) */}
      {isAdmin && (
        <>
          <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuovo Cliente" size="lg">
            <ClientForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
          </Modal>

          <Modal
            open={!!editingClient}
            onClose={() => setEditingClient(undefined)}
            title="Modifica Cliente"
            size="lg"
          >
            {editingClient && (
              <ClientForm
                client={editingClient}
                monthlyFee={editingMonthlyFee}
                onSubmit={handleUpdate}
                onCancel={() => { setEditingClient(undefined); setEditingMonthlyFee(undefined); }}
              />
            )}
          </Modal>

          <Modal
            open={!!deleteConfirm}
            onClose={() => setDeleteConfirm(null)}
            title="Elimina Cliente"
            size="sm"
          >
            <p className="text-pw-text-muted mb-6">
              Sei sicuro di voler eliminare questo cliente? Questa azione non può essere annullata.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Annulla
              </Button>
              <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
                Elimina
              </Button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
