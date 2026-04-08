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
  const [error, setError] = useState(false);

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
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = clients
    .filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.toLowerCase().includes(search.toLowerCase()) ||
        (isAdmin && c.email?.toLowerCase().includes(search.toLowerCase()))
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
      setShowForm(false);
      toast.success('Cliente creato con successo');
      fetchClients();
    } catch {
      toast.error('Errore durante la creazione del cliente');
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
        <button onClick={() => { setLoading(true); setError(false); fetchClients(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-pw-bg text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca clienti..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
          />
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

                {(client.service_types || client.relationship_start) && (
                  <div className="space-y-1.5 mb-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
