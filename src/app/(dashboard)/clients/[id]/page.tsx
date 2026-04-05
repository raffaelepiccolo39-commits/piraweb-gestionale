'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { ContractForm, type ContractFormData } from '@/components/clients/contract-form';
import { PaymentCalendar } from '@/components/clients/payment-calendar';
import { FinancialSummary } from '@/components/clients/financial-summary';
import { KnowledgeBaseForm } from '@/components/clients/knowledge-base-form';
import { OnboardingSection } from '@/components/clients/onboarding-section';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Client, ClientContract, ClientPayment, ClientFinancialSummary, PaymentLog, ClientKnowledgeBase } from '@/types/database';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  FileText,
  Plus,
  Calendar,
  History,
  Check,
  X,
  Download,
  Paperclip,
  AlertTriangle,
  RefreshCw,
  Archive,
  Brain,
} from 'lucide-react';

function formatMonthLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

function getContractExpiryInfo(contract: ClientContract): { status: 'ok' | 'warning' | 'danger' | 'expired'; daysLeft: number; label: string } {
  const start = new Date(contract.start_date);
  const end = new Date(start);
  end.setMonth(end.getMonth() + contract.duration_months);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { status: 'expired', daysLeft: 0, label: 'Contratto scaduto' };
  if (daysLeft <= 15) return { status: 'danger', daysLeft, label: `Scade tra ${daysLeft} giorni` };
  if (daysLeft <= 30) return { status: 'warning', daysLeft, label: `Scade tra ${daysLeft} giorni` };
  return { status: 'ok', daysLeft, label: `${daysLeft} giorni rimanenti` };
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [contract, setContract] = useState<ClientContract | null>(null);
  const [pastContracts, setPastContracts] = useState<ClientContract[]>([]);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [summary, setSummary] = useState<ClientFinancialSummary | null>(null);
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<ClientKnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContractForm, setShowContractForm] = useState(false);
  const [showRenewForm, setShowRenewForm] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const fetchData = useCallback(async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (clientData) setClient(clientData as Client);

    if (isAdmin) {
      // Fetch knowledge base
      const { data: kbData } = await supabase
        .from('client_knowledge_base')
        .select('*')
        .eq('client_id', id)
        .maybeSingle();
      setKnowledgeBase(kbData as ClientKnowledgeBase | null);
      // Fetch all contracts
      const { data: allContracts } = await supabase
        .from('client_contracts')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false });

      const contracts = (allContracts as ClientContract[]) || [];
      const activeContract = contracts.find((c) => c.status === 'active') || null;
      const past = contracts.filter((c) => c.status !== 'active');

      setContract(activeContract);
      setPastContracts(past);

      if (activeContract) {
        const [paymentsRes, summaryRes, logsRes] = await Promise.all([
          supabase
            .from('client_payments')
            .select('*')
            .eq('contract_id', activeContract.id)
            .order('month_index'),
          supabase.rpc('get_client_financial_summary', { p_client_id: id }),
          supabase
            .from('payment_logs')
            .select('*, performer:profiles!payment_logs_performed_by_fkey(full_name)')
            .eq('client_id', id)
            .order('performed_at', { ascending: false })
            .limit(50),
        ]);

        if (paymentsRes.data) setPayments(paymentsRes.data as ClientPayment[]);
        if (summaryRes.data && summaryRes.data.length > 0) {
          setSummary(summaryRes.data[0] as ClientFinancialSummary);
        }
        if (logsRes.data) setLogs(logsRes.data as PaymentLog[]);
      } else {
        setPayments([]);
        setSummary(null);
        setLogs([]);
      }
    }

    setLoading(false);
  }, [supabase, id, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveKnowledgeBase = async (data: Partial<ClientKnowledgeBase>) => {
    if (knowledgeBase) {
      await supabase
        .from('client_knowledge_base')
        .update(data)
        .eq('id', knowledgeBase.id);
    } else {
      await supabase
        .from('client_knowledge_base')
        .insert({ ...data, client_id: id });
    }
    // Refresh
    const { data: kbData } = await supabase
      .from('client_knowledge_base')
      .select('*')
      .eq('client_id', id)
      .maybeSingle();
    setKnowledgeBase(kbData as ClientKnowledgeBase | null);
  };

  const uploadAttachment = async (file: File): Promise<{ url: string; name: string } | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${id}/${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from('contracts').upload(fileName, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(fileName);
    return { url: urlData.publicUrl, name: file.name };
  };

  const handleCreateContract = async (data: ContractFormData) => {
    if (!profile) return;

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (data.attachment) {
      const result = await uploadAttachment(data.attachment);
      if (result) {
        attachmentUrl = result.url;
        attachmentName = result.name;
      }
    }

    const { data: newContract, error } = await supabase
      .from('client_contracts')
      .insert({
        client_id: id,
        monthly_fee: data.monthly_fee,
        duration_months: data.duration_months,
        start_date: data.start_date,
        payment_timing: data.payment_timing,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        notes: data.notes || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !newContract) {
      setContractError(error?.message || 'Contratto non creato');
      return;
    }

    await supabase.rpc('generate_contract_payments', { p_contract_id: newContract.id });

    setShowContractForm(false);
    fetchData();
  };

  const handleRenewContract = async (data: ContractFormData) => {
    if (!profile || !contract) return;

    // Close current contract
    await supabase
      .from('client_contracts')
      .update({ status: 'completed' })
      .eq('id', contract.id);

    // Create new one
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (data.attachment) {
      const result = await uploadAttachment(data.attachment);
      if (result) {
        attachmentUrl = result.url;
        attachmentName = result.name;
      }
    }

    const { data: newContract, error } = await supabase
      .from('client_contracts')
      .insert({
        client_id: id,
        monthly_fee: data.monthly_fee,
        duration_months: data.duration_months,
        start_date: data.start_date,
        payment_timing: data.payment_timing,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        notes: data.notes || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !newContract) {
      setContractError(error?.message || 'Rinnovo non riuscito');
      return;
    }

    await supabase.rpc('generate_contract_payments', { p_contract_id: newContract.id });

    setShowRenewForm(false);
    fetchData();
  };

  const handleTogglePaid = async (payment: ClientPayment) => {
    if (!profile || !contract) return;

    const newPaidStatus = !payment.is_paid;

    await supabase
      .from('client_payments')
      .update({
        is_paid: newPaidStatus,
        paid_at: newPaidStatus ? new Date().toISOString() : null,
      })
      .eq('id', payment.id);

    await supabase.from('payment_logs').insert({
      payment_id: payment.id,
      contract_id: contract.id,
      client_id: id,
      action: newPaidStatus ? 'paid' : 'unpaid',
      amount: payment.amount,
      month_index: payment.month_index,
      due_date: payment.due_date,
      performed_by: profile.id,
    });

    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Cliente non trovato</p>
        <Button variant="outline" onClick={() => router.push('/clients')} className="mt-4">
          <ArrowLeft size={16} />
          Torna ai Clienti
        </Button>
      </div>
    );
  }

  const expiry = contract ? getContractExpiryInfo(contract) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.push('/clients')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Building2 size={24} className="text-pw-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
              {client.name}
            </h1>
            {client.company && (
              <p className="text-sm text-pw-text-muted">{client.company}</p>
            )}
          </div>
        </div>
      </div>

      {/* Expiry alert */}
      {isAdmin && expiry && expiry.status !== 'ok' && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          expiry.status === 'expired'
            ? 'bg-red-500/10 border border-red-500/20'
            : expiry.status === 'danger'
            ? 'bg-red-500/10 border border-red-500/20'
            : 'bg-amber-500/10 border border-amber-500/20'
        }`}>
          <AlertTriangle size={24} className={
            expiry.status === 'expired' || expiry.status === 'danger'
              ? 'text-red-500'
              : 'text-amber-500'
          } />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${
              expiry.status === 'expired' || expiry.status === 'danger'
                ? 'text-red-400'
                : 'text-amber-400'
            }`}>
              {expiry.label}
            </p>
            <p className="text-xs text-pw-text-muted mt-0.5">
              {expiry.status === 'expired'
                ? 'Il contratto è scaduto. Rinnova con nuove condizioni.'
                : 'Il contratto sta per scadere. Contatta il cliente per il rinnovo.'}
            </p>
          </div>
          <Button onClick={() => setShowRenewForm(true)} size="sm">
            <RefreshCw size={14} />
            Rinnova
          </Button>
        </div>
      )}

      {/* Client info (admin only) */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text">
                Informazioni Contatto
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {client.email && (
                  <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                    <Mail size={16} className="text-pw-text-dim shrink-0" />
                    <span>{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                    <Phone size={16} className="text-pw-text-dim shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-2 text-sm text-pw-text-muted">
                    <Globe size={16} className="text-pw-text-dim shrink-0" />
                    <span>{client.website}</span>
                  </div>
                )}
              </div>
              {client.notes && (
                <p className="text-sm text-pw-text-muted mt-3 pt-3 border-t border-pw-border">
                  {client.notes}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Dati fiscali */}
          {(client.partita_iva || client.codice_fiscale || client.ragione_sociale) && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-pw-text">
                  Dati Fiscali
                </h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2.5 text-sm">
                  {client.ragione_sociale && (
                    <div>
                      <span className="text-pw-text-dim text-xs uppercase tracking-wider">Ragione Sociale</span>
                      <p className="text-pw-text font-medium">{client.ragione_sociale}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {client.partita_iva && (
                      <div>
                        <span className="text-pw-text-dim text-xs uppercase tracking-wider">P. IVA</span>
                        <p className="text-pw-text font-mono font-medium">{client.partita_iva}</p>
                      </div>
                    )}
                    {client.codice_fiscale && (
                      <div>
                        <span className="text-pw-text-dim text-xs uppercase tracking-wider">Codice Fiscale</span>
                        <p className="text-pw-text font-mono font-medium">{client.codice_fiscale}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {client.codice_sdi && (
                      <div>
                        <span className="text-pw-text-dim text-xs uppercase tracking-wider">Codice SDI</span>
                        <p className="text-pw-text font-mono font-medium">{client.codice_sdi}</p>
                      </div>
                    )}
                    {client.pec && (
                      <div>
                        <span className="text-pw-text-dim text-xs uppercase tracking-wider">PEC</span>
                        <p className="text-pw-text font-medium">{client.pec}</p>
                      </div>
                    )}
                  </div>
                  {(client.indirizzo || client.citta) && (
                    <div>
                      <span className="text-pw-text-dim text-xs uppercase tracking-wider">Sede</span>
                      <p className="text-pw-text font-medium">
                        {client.indirizzo}
                        {client.indirizzo && (client.cap || client.citta) && ' — '}
                        {client.cap} {client.citta} {client.provincia && `(${client.provincia})`}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Onboarding (admin only) */}
      {isAdmin && <OnboardingSection clientId={id} />}

      {/* Knowledge Base (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain size={20} className="text-pw-accent" />
              <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
                Strategia & Knowledge Base
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            <KnowledgeBaseForm data={knowledgeBase} onSave={handleSaveKnowledgeBase} />
          </CardContent>
        </Card>
      )}

      {/* Contract section (admin only) */}
      {isAdmin && (
        <>
          {!contract ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText size={40} className="text-pw-text-dim mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-pw-text mb-1">
                  Nessun contratto attivo
                </h3>
                <p className="text-sm text-pw-text-muted mb-4">
                  Crea un contratto per monitorare i pagamenti mensili
                </p>
                <Button onClick={() => setShowContractForm(true)}>
                  <Plus size={16} />
                  Crea Contratto
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Contract info */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={20} className="text-gray-400" />
                      <h2 className="text-lg font-semibold text-pw-text">
                        Contratto Attivo
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {expiry && expiry.status === 'ok' && (
                        <Badge className="bg-green-500/15 text-green-400">
                          {expiry.label}
                        </Badge>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setShowRenewForm(true)}>
                        <RefreshCw size={14} />
                        Rinnova / Aggiorna
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
                    <div>
                      <p className="text-pw-text-muted">Canone Mensile</p>
                      <p className="font-semibold text-pw-text text-lg">
                        {formatCurrency(contract.monthly_fee)}
                      </p>
                    </div>
                    <div>
                      <p className="text-pw-text-muted">Durata</p>
                      <p className="font-semibold text-pw-text text-lg">
                        {contract.duration_months} mesi
                      </p>
                    </div>
                    <div>
                      <p className="text-pw-text-muted">Data Inizio</p>
                      <p className="font-semibold text-pw-text">
                        {formatDate(contract.start_date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-pw-text-muted">Modalità Pagamento</p>
                      <p className="font-semibold text-pw-text">
                        {contract.payment_timing === 'inizio_mese' ? 'Anticipato' : 'Fine mese'}
                      </p>
                    </div>
                    <div>
                      <p className="text-pw-text-muted">Valore Totale</p>
                      <p className="font-semibold text-pw-accent text-lg">
                        {formatCurrency(contract.monthly_fee * contract.duration_months)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-pw-border flex flex-wrap items-center gap-4">
                    {contract.attachment_url && contract.attachment_name && (
                      <a
                        href={contract.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-pw-accent text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                      >
                        <Paperclip size={14} />
                        {contract.attachment_name}
                        <Download size={14} />
                      </a>
                    )}
                    {!contract.attachment_url && (
                      <span className="text-xs text-gray-400 italic">Nessun contratto allegato</span>
                    )}
                    {contract.notes && (
                      <p className="text-sm text-pw-text-muted">{contract.notes}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {summary && <FinancialSummary summary={summary} />}

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Calendar size={20} className="text-gray-400" />
                    <h2 className="text-lg font-semibold text-pw-text">
                      Calendario Pagamenti
                    </h2>
                  </div>
                </CardHeader>
                <CardContent>
                  <PaymentCalendar payments={payments} onTogglePaid={handleTogglePaid} />
                </CardContent>
              </Card>

              {logs.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <History size={20} className="text-gray-400" />
                      <h2 className="text-lg font-semibold text-pw-text">
                        Storico Movimenti
                      </h2>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-pw-border">
                      {logs.map((log) => (
                        <div key={log.id} className="px-6 py-3 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            log.action === 'paid' ? 'bg-green-500/15' : 'bg-red-500/15'
                          }`}>
                            {log.action === 'paid' ? (
                              <Check size={14} className="text-green-400" />
                            ) : (
                              <X size={14} className="text-red-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-pw-text">
                              Pagamento <strong>{log.action === 'paid' ? 'registrato' : 'annullato'}</strong> per{' '}
                              <span className="capitalize">{formatMonthLabel(log.due_date)}</span>
                            </p>
                            <p className="text-xs text-pw-text-muted">
                              {(log.performer as unknown as { full_name: string })?.full_name || 'Admin'} &middot;{' '}
                              {new Date(log.performed_at).toLocaleString('it-IT')}
                            </p>
                          </div>
                          <p className={`text-sm font-semibold shrink-0 ${
                            log.action === 'paid' ? 'text-green-400' : 'text-red-500 dark:text-red-400'
                          }`}>
                            {log.action === 'paid' ? '+' : '-'}{formatCurrency(log.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Past contracts */}
          {pastContracts.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Archive size={20} className="text-gray-400" />
                  <h2 className="text-lg font-semibold text-pw-text">
                    Contratti Precedenti
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-pw-border">
                  {pastContracts.map((pc) => {
                    const endDate = new Date(pc.start_date);
                    endDate.setMonth(endDate.getMonth() + pc.duration_months);

                    return (
                      <div key={pc.id} className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium text-pw-text">
                                {formatCurrency(pc.monthly_fee)}/mese &middot; {pc.duration_months} mesi
                              </p>
                              <Badge className={
                                pc.status === 'completed'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                  : 'bg-pw-surface-3 text-pw-text-muted'
                              }>
                                {pc.status === 'completed' ? 'Completato' : 'Cancellato'}
                              </Badge>
                            </div>
                            <p className="text-xs text-pw-text-muted">
                              {formatDate(pc.start_date)} — {formatDate(endDate.toISOString())}
                              {pc.payment_timing && (
                                <> &middot; {pc.payment_timing === 'inizio_mese' ? 'Anticipato' : 'Fine mese'}</>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                              {formatCurrency(pc.monthly_fee * pc.duration_months)}
                            </p>
                            {pc.attachment_url && pc.attachment_name && (
                              <a
                                href={pc.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-pw-surface-2 text-gray-400 hover:text-indigo-600"
                                title={pc.attachment_name}
                              >
                                <Download size={16} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Non-admin view */}
      {!isAdmin && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-pw-text-muted">
              Visualizzazione limitata. Contatta un amministratore per maggiori dettagli.
            </p>
          </CardContent>
        </Card>
      )}

      {/* New contract modal */}
      <Modal
        open={showContractForm}
        onClose={() => setShowContractForm(false)}
        title="Nuovo Contratto"
      >
        {contractError && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {contractError}
          </div>
        )}
        <ContractForm
          onSubmit={handleCreateContract}
          onCancel={() => { setShowContractForm(false); setContractError(null); }}
        />
      </Modal>

      {/* Renew contract modal */}
      <Modal
        open={showRenewForm}
        onClose={() => setShowRenewForm(false)}
        title="Rinnova / Aggiorna Contratto"
        size="lg"
      >
        <div className="mb-4 p-3 rounded-xl bg-blue-500/10 text-blue-400 text-sm">
          Il contratto attuale verrà chiuso e ne verrà creato uno nuovo con le condizioni aggiornate.
          Il contratto precedente resterà nello storico con il suo allegato.
        </div>
        <ContractForm
          onSubmit={handleRenewContract}
          onCancel={() => setShowRenewForm(false)}
        />
      </Modal>
    </div>
  );
}
