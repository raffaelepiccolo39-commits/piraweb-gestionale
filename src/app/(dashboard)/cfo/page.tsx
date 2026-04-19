'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils';
import { AdminGate } from '@/components/ui/admin-gate';
import type { Profile, OperatingExpense, Payslip, Invoice, Client } from '@/types/database';
import { parsePayslipAction, savePayslipsAction } from './actions';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  Upload,
  FileText,
  Users,
  Building2,
  Receipt,
  Calculator,
  PieChart,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Wallet,
  Sparkles,
} from 'lucide-react';

// ─── Italian Tax Constants (2026) ───
const INPS_EMPLOYER_RATE = 0.2981; // ~29.81% contributi INPS datore
const INPS_EMPLOYEE_RATE = 0.0919; // ~9.19% contributi INPS dipendente
const TFR_RATE = 0.0741; // 7.41% TFR accantonamento annuo
const IRAP_RATE = 0.039; // 3.9% IRAP regionale
const IRPEF_BRACKETS = [
  { max: 28000, rate: 0.23 },
  { max: 50000, rate: 0.35 },
  { max: Infinity, rate: 0.43 },
];

function calculateIrpef(annualGross: number): number {
  const taxableIncome = annualGross * (1 - INPS_EMPLOYEE_RATE);
  let tax = 0;
  let remaining = taxableIncome;
  let prevMax = 0;
  for (const bracket of IRPEF_BRACKETS) {
    const taxable = Math.min(remaining, bracket.max - prevMax);
    tax += taxable * bracket.rate;
    remaining -= taxable;
    prevMax = bracket.max;
    if (remaining <= 0) break;
  }
  return tax;
}

function calculateEmployeeCosts(monthlySalary: number) {
  const annualGross = monthlySalary * 13; // 13 mensilita
  const monthlyGross = monthlySalary;

  // Costi azienda (sopra lo stipendio lordo)
  const inpsEmployer = annualGross * INPS_EMPLOYER_RATE;
  const tfr = annualGross * TFR_RATE;
  const totalAnnualCostCompany = annualGross + inpsEmployer + tfr;
  const monthlyCostCompany = totalAnnualCostCompany / 12;

  // Netto dipendente (sotto lo stipendio lordo)
  const inpsEmployee = annualGross * INPS_EMPLOYEE_RATE;
  const irpef = calculateIrpef(annualGross);
  const annualNet = annualGross - inpsEmployee - irpef;
  const monthlyNet = annualNet / 13; // su 13 mensilita

  return {
    monthlyGross,
    annualGross,
    inpsEmployer: inpsEmployer / 12,
    inpsEmployee: inpsEmployee / 12,
    tfr: tfr / 12,
    irpef: irpef / 12,
    monthlyNet,
    monthlyCostCompany,
    annualCostCompany: totalAnnualCostCompany,
    annualNet,
  };
}

const EXPENSE_CATEGORIES = [
  { value: 'ufficio', label: 'Ufficio & Affitto' },
  { value: 'software', label: 'Software & Licenze' },
  { value: 'marketing', label: 'Marketing & Ads' },
  { value: 'utenze', label: 'Utenze' },
  { value: 'servizi', label: 'Servizi Professionali' },
  { value: 'attrezzature', label: 'Attrezzature' },
  { value: 'formazione', label: 'Formazione' },
  { value: 'altro', label: 'Altro' },
];

interface ClientProfitability {
  clientId: string;
  clientName: string;
  monthlyFee: number;
  totalPaid: number;
  totalExpected: number;
  hoursLogged: number;
  internalCost: number;
  freelancerCost: number;
  grossProfit: number;
  marginPct: number;
}

export default function CFOPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<(Profile & { costs: ReturnType<typeof calculateEmployeeCosts> })[]>([]);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [clientProfitability, setClientProfitability] = useState<ClientProfitability[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OperatingExpense | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    name: '', category: 'altro', amount: '', is_recurring: true, frequency: 'monthly', vendor: '', notes: '',
  });

  // Payslips
  const [payslips, setPayslips] = useState<(Payslip & { employee?: Profile })[]>([]);
  const [showPayslipUpload, setShowPayslipUpload] = useState(false);
  const [payslipFile, setPayslipFile] = useState<File | null>(null);
  const [parsingPayslip, setParsingPayslip] = useState(false);
  const [parsedPayslips, setParsedPayslips] = useState<Record<string, unknown>[] | null>(null);
  const [savingPayslips, setSavingPayslips] = useState(false);

  // Invoices analysis
  const [invoices, setInvoices] = useState<(Invoice & { client?: Client })[]>([]);

  // Summary data
  const [summary, setSummary] = useState({
    mrr: 0,
    totalReceived: 0,
    totalExpected: 0,
    totalPending: 0,
    activeClients: 0,
    activeContracts: 0,
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const fetchAll = useCallback(async () => {
    // Parallel fetch all data
    const [
      profilesRes, contractsRes, paymentsRes, expensesRes,
      timeRes, freelancerRes, clientsRes, payslipsRes, invoicesRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('client_contracts').select('client_id, monthly_fee, status, duration_months, start_date').eq('status', 'active'),
      supabase.from('client_payments').select('contract_id, amount, is_paid, due_date, client_id:client_contracts(client_id)').limit(5000),
      supabase.from('operating_expenses').select('*').eq('is_active', true).order('category'),
      supabase.from('time_entries').select('user_id, task_id, duration_minutes, started_at').gte('started_at', yearStart).not('duration_minutes', 'is', null).limit(10000),
      supabase.from('task_freelancer_assignments').select('task_id, total_cost, status').limit(5000),
      supabase.from('clients').select('id, name, company, ragione_sociale, is_active').eq('is_active', true),
      supabase.from('payslips').select('*').order('month', { ascending: false }).limit(200),
      supabase.from('invoices').select('*, client:clients(id, name, company, ragione_sociale)').order('issue_date', { ascending: false }).limit(100),
    ]);

    const profiles = (profilesRes.data || []) as Profile[];
    const contracts = contractsRes.data || [];
    const payments = paymentsRes.data || [];
    const expData = (expensesRes.data || []) as OperatingExpense[];
    const timeEntries = timeRes.data || [];
    const freelancerAssignments = freelancerRes.data || [];
    setPayslips((payslipsRes.data || []) as (Payslip & { employee?: Profile })[]);
    setInvoices((invoicesRes.data || []) as (Invoice & { client?: Client })[]);
    const clients = clientsRes.data || [];

    // ── Employees with tax calculations ──
    const emps = profiles
      .filter(p => p.salary && p.salary > 0)
      .map(p => ({
        ...p,
        costs: calculateEmployeeCosts(p.salary!),
      }));
    setEmployees(emps);

    // ── Expenses ──
    setExpenses(expData);

    // ── Revenue summary ──
    const mrr = contracts.reduce((s, c) => s + (c.monthly_fee || 0), 0);
    const totalExpected = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalReceived = payments.filter(p => p.is_paid).reduce((s, p) => s + (p.amount || 0), 0);
    const totalPending = totalExpected - totalReceived;

    setSummary({
      mrr,
      totalReceived,
      totalExpected,
      totalPending,
      activeClients: clients.length,
      activeContracts: contracts.length,
    });

    // ── Client profitability ──
    // Build maps
    const contractByClientId = new Map<string, number>();
    contracts.forEach(c => {
      contractByClientId.set(c.client_id, (contractByClientId.get(c.client_id) || 0) + (c.monthly_fee || 0));
    });

    // Tasks by project → client mapping would need projects table
    // For now, calculate aggregate per-client from payments
    const clientPaidMap = new Map<string, number>();
    const clientExpectedMap = new Map<string, number>();
    payments.forEach(p => {
      const clientId = (p.client_id as { client_id: string } | null)?.client_id;
      if (!clientId) return;
      clientExpectedMap.set(clientId, (clientExpectedMap.get(clientId) || 0) + (p.amount || 0));
      if (p.is_paid) clientPaidMap.set(clientId, (clientPaidMap.get(clientId) || 0) + (p.amount || 0));
    });

    // Average hourly cost across all employees
    const avgHourlyCost = emps.length > 0
      ? emps.reduce((s, e) => s + e.costs.monthlyCostCompany, 0) / emps.length / 160
      : 25;

    const clientProfit: ClientProfitability[] = clients.map(client => {
      const monthlyFee = contractByClientId.get(client.id) || 0;
      const totalPaid = clientPaidMap.get(client.id) || 0;
      const totalExp = clientExpectedMap.get(client.id) || 0;
      // Rough estimation of internal cost based on hours
      const hoursLogged = 0; // Would need project→task→time_entry join
      const internalCost = hoursLogged * avgHourlyCost;
      const freelancerCost = 0;
      const grossProfit = totalPaid - internalCost - freelancerCost;
      const marginPct = totalPaid > 0 ? (grossProfit / totalPaid) * 100 : 0;

      return {
        clientId: client.id,
        clientName: client.ragione_sociale || client.company || client.name,
        monthlyFee,
        totalPaid,
        totalExpected: totalExp,
        hoursLogged,
        internalCost,
        freelancerCost,
        grossProfit,
        marginPct,
      };
    }).filter(c => c.monthlyFee > 0 || c.totalPaid > 0)
      .sort((a, b) => b.totalPaid - a.totalPaid);

    setClientProfitability(clientProfit);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Expense handlers ──
  const resetExpenseForm = () => {
    setExpenseForm({ name: '', category: 'altro', amount: '', is_recurring: true, frequency: 'monthly', vendor: '', notes: '' });
    setEditingExpense(null);
  };

  const openAddExpense = () => { resetExpenseForm(); setShowExpenseForm(true); };

  const openEditExpense = (exp: OperatingExpense) => {
    setEditingExpense(exp);
    setExpenseForm({
      name: exp.name, category: exp.category, amount: String(exp.amount),
      is_recurring: exp.is_recurring, frequency: exp.frequency, vendor: exp.vendor || '', notes: exp.notes || '',
    });
    setShowExpenseForm(true);
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.name || !expenseForm.amount || !profile) return;
    setSavingExpense(true);
    const payload = {
      name: expenseForm.name,
      category: expenseForm.category,
      amount: parseFloat(expenseForm.amount),
      is_recurring: expenseForm.is_recurring,
      frequency: expenseForm.frequency,
      vendor: expenseForm.vendor || null,
      notes: expenseForm.notes || null,
    };
    if (editingExpense) {
      await supabase.from('operating_expenses').update(payload).eq('id', editingExpense.id);
    } else {
      await supabase.from('operating_expenses').insert({ ...payload, created_by: profile.id });
    }
    setSavingExpense(false);
    setShowExpenseForm(false);
    resetExpenseForm();
    fetchAll();
  };

  const handleDeleteExpense = async (id: string) => {
    // TODO: replace with ConfirmDialog component
    if (!confirm('Eliminare questa spesa?')) return;
    await supabase.from('operating_expenses').update({ is_active: false }).eq('id', id);
    fetchAll();
  };

  // ── Payslip handlers ──
  const handleParsePayslip = async () => {
    if (!payslipFile) { toast.error('Seleziona un file'); return; }
    setParsingPayslip(true);
    setParsedPayslips(null);

    try {
      // Convert file to base64 client-side, then pass to Server Action
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('Errore lettura file'));
        reader.readAsDataURL(payslipFile);
      });

      const data = await parsePayslipAction(base64, payslipFile.type || 'application/pdf');

      if (data.success && data.payslips) {
        setParsedPayslips(data.payslips);
        toast.success(`${data.count} buste paga trovate nel documento`);
      } else {
        toast.error(data.error || 'Errore nell\'analisi del documento');
      }
    } catch {
      toast.error('Errore di connessione');
    } finally {
      setParsingPayslip(false);
    }
  };

  const handleSaveAllPayslips = async () => {
    if (!parsedPayslips || !profile) return;
    setSavingPayslips(true);

    try {
      const result = await savePayslipsAction(parsedPayslips);

      if (result.saved && result.saved > 0) toast.success(`${result.saved} buste paga salvate`);
      if (result.errors && result.errors > 0) toast.error(`${result.errors} buste paga non salvate (dipendente non trovato)`);
      if (result.error) toast.error(result.error);
    } catch {
      toast.error('Errore nel salvataggio');
    }

    setSavingPayslips(false);
    setShowPayslipUpload(false);
    setPayslipFile(null);
    setParsedPayslips(null);
    fetchAll();
  };

  const handleDeletePayslip = async (id: string) => {
    // TODO: replace with ConfirmDialog component
    if (!confirm('Eliminare questa busta paga?')) return;
    await supabase.from('payslips').delete().eq('id', id);
    fetchAll();
  };

  // ── Invoice net calculation ──
  // For SRL: revenue - IVA (already excluded in imponibile) - IRES (24%) - IRAP (3.9%)
  const IRES_RATE = 0.24;
  function calculateInvoiceNet(invoice: Invoice) {
    const imponibile = invoice.subtotal;
    const iva = invoice.vat_amount;
    const ires = imponibile * IRES_RATE;
    const irap = imponibile * IRAP_RATE;
    const nettoAzienda = imponibile - ires - irap;
    return { imponibile, iva, ires, irap, nettoAzienda, totaleIncIva: invoice.total };
  }

  // ── Calculations ──
  // Use REAL payslip data (latest month) when available, otherwise fall back to estimates
  const latestPayslipMonth = payslips.length > 0 ? payslips[0].month : null;
  const latestPayslips = latestPayslipMonth
    ? payslips.filter(p => p.month === latestPayslipMonth)
    : [];
  const hasRealData = latestPayslips.length > 0;

  const totalMonthlySalariesGross = hasRealData
    ? latestPayslips.reduce((s, p) => s + p.lordo_mensile, 0)
    : employees.reduce((s, e) => s + e.costs.monthlyGross, 0);
  const totalMonthlySalariesCostCompany = hasRealData
    ? latestPayslips.reduce((s, p) => s + (p.costo_totale_azienda || p.lordo_mensile), 0)
    : employees.reduce((s, e) => s + e.costs.monthlyCostCompany, 0);
  const totalMonthlyINPS = hasRealData
    ? latestPayslips.reduce((s, p) => s + p.inps_azienda, 0)
    : employees.reduce((s, e) => s + e.costs.inpsEmployer, 0);
  const totalMonthlyTFR = hasRealData
    ? latestPayslips.reduce((s, p) => s + p.tfr_accantonamento, 0)
    : employees.reduce((s, e) => s + e.costs.tfr, 0);
  const totalMonthlyNetEmployees = hasRealData
    ? latestPayslips.reduce((s, p) => s + p.netto_mensile, 0)
    : employees.reduce((s, e) => s + e.costs.monthlyNet, 0);

  // Monthly operating expenses
  const monthlyExpenses = expenses.reduce((total, exp) => {
    if (exp.frequency === 'monthly') return total + exp.amount;
    if (exp.frequency === 'quarterly') return total + exp.amount / 3;
    if (exp.frequency === 'yearly') return total + exp.amount / 12;
    return total;
  }, 0);

  const totalMonthlyCosts = totalMonthlySalariesCostCompany + monthlyExpenses;
  const monthlyNetProfit = summary.mrr - totalMonthlyCosts;
  const monthlyMarginPct = summary.mrr > 0 ? (monthlyNetProfit / summary.mrr) * 100 : 0;
  const annualRevenue = summary.mrr * 12;
  const annualCosts = totalMonthlyCosts * 12;
  const annualNetProfit = annualRevenue - annualCosts;

  // IRAP estimate
  const irapEstimate = (annualRevenue - expenses.reduce((t, e) => {
    if (e.frequency === 'yearly') return t + e.amount;
    if (e.frequency === 'quarterly') return t + e.amount * 4;
    if (e.frequency === 'monthly') return t + e.amount * 12;
    return t;
  }, 0)) * IRAP_RATE / 12;

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Calculator size={40} className="mx-auto text-pw-text-dim mb-3" />
          <p className="text-pw-text font-semibold">Accesso non autorizzato</p>
          <p className="text-sm text-pw-text-muted mt-1">Solo gli amministratori possono accedere a questa sezione</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AdminGate>
    <div className="space-y-8 max-w-7xl animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
          <Calculator size={24} className="text-pw-accent" />
          CFO Dashboard
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Controllo finanziario completo - Costi, ricavi, margini, tasse
        </p>
      </div>

      {/* ═══ SEZIONE 1: KPI PRINCIPALI ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">MRR (Ricavo Mensile)</p>
            <p className="text-2xl font-bold text-green-400 font-[var(--font-bebas)] mt-1 animate-count">{formatCurrency(summary.mrr)}</p>
            <p className="text-xs text-pw-text-dim mt-1">{summary.activeContracts} contratti attivi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">Costi Mensili Totali</p>
            <p className="text-2xl font-bold text-red-400 font-[var(--font-bebas)] mt-1 animate-count">{formatCurrency(totalMonthlyCosts)}</p>
            <p className="text-xs text-pw-text-dim mt-1">Personale + Operativi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">Utile Netto Mensile</p>
            <p className={`text-2xl font-bold font-[var(--font-bebas)] mt-1 animate-count ${monthlyNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(monthlyNetProfit)}
            </p>
            <p className="text-xs text-pw-text-dim mt-1">Margine: {monthlyMarginPct.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">Incassato vs Atteso</p>
            <p className="text-2xl font-bold text-pw-accent font-[var(--font-bebas)] mt-1 animate-count">{formatCurrency(summary.totalReceived)}</p>
            <p className="text-xs text-pw-text-dim mt-1">
              da incassare: {formatCurrency(summary.totalPending)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SEZIONE 2: CONTO ECONOMICO ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-pw-accent" />
            <h2 className="text-lg font-semibold text-pw-text">Conto Economico (Stima Mensile)</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            {/* Ricavi */}
            <div className="flex justify-between py-2 font-semibold text-green-400 border-b border-pw-border">
              <span>RICAVI</span>
              <span>{formatCurrency(summary.mrr)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-pw-text-muted pl-4">
              <span>Contratti attivi ({summary.activeContracts})</span>
              <span>{formatCurrency(summary.mrr)}</span>
            </div>

            {/* Costo del personale */}
            <div className="flex justify-between py-2 font-semibold text-red-400 border-b border-pw-border mt-3">
              <span>COSTO DEL PERSONALE</span>
              <span>-{formatCurrency(totalMonthlySalariesCostCompany)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-pw-text-muted pl-4">
              <span>Stipendi lordi ({employees.length} dipendenti)</span>
              <span>-{formatCurrency(totalMonthlySalariesGross)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-pw-text-muted pl-4">
              <span>INPS carico azienda ({(INPS_EMPLOYER_RATE * 100).toFixed(1)}%)</span>
              <span>-{formatCurrency(totalMonthlyINPS)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-pw-text-muted pl-4">
              <span>TFR accantonamento ({(TFR_RATE * 100).toFixed(2)}%)</span>
              <span>-{formatCurrency(totalMonthlyTFR)}</span>
            </div>

            {/* Spese operative */}
            <div className="flex justify-between py-2 font-semibold text-orange-400 border-b border-pw-border mt-3">
              <span>SPESE OPERATIVE</span>
              <span>-{formatCurrency(monthlyExpenses)}</span>
            </div>
            {EXPENSE_CATEGORIES.map(cat => {
              const catExpenses = expenses.filter(e => e.category === cat.value);
              if (catExpenses.length === 0) return null;
              const catTotal = catExpenses.reduce((t, e) => {
                if (e.frequency === 'monthly') return t + e.amount;
                if (e.frequency === 'quarterly') return t + e.amount / 3;
                if (e.frequency === 'yearly') return t + e.amount / 12;
                return t;
              }, 0);
              return (
                <div key={cat.value} className="flex justify-between py-1.5 text-pw-text-muted pl-4">
                  <span>{cat.label}</span>
                  <span>-{formatCurrency(catTotal)}</span>
                </div>
              );
            })}
            {expenses.length === 0 && (
              <div className="flex justify-between py-1.5 text-pw-text-dim pl-4">
                <span>Nessuna spesa operativa configurata</span>
                <button onClick={openAddExpense} className="text-pw-accent hover:underline text-xs">+ Aggiungi</button>
              </div>
            )}

            {/* Imposte stimate */}
            <div className="flex justify-between py-2 font-semibold text-yellow-400 border-b border-pw-border mt-3">
              <span>IMPOSTE (stima)</span>
              <span>-{formatCurrency(irapEstimate)}</span>
            </div>
            <div className="flex justify-between py-1.5 text-pw-text-muted pl-4">
              <span>IRAP ({(IRAP_RATE * 100).toFixed(1)}%)</span>
              <span>-{formatCurrency(irapEstimate)}</span>
            </div>

            {/* Utile netto */}
            <div className={`flex justify-between py-3 font-bold text-base border-t-2 border-pw-border mt-4 ${monthlyNetProfit - irapEstimate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              <span>UTILE NETTO STIMATO</span>
              <span>{formatCurrency(monthlyNetProfit - irapEstimate)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ SEZIONE 3: PROIEZIONE ANNUALE ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">Fatturato Annuo Stimato</p>
            <p className="text-2xl font-bold text-green-400 font-[var(--font-bebas)] mt-2 animate-count">{formatCurrency(annualRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">Costi Annui Stimati</p>
            <p className="text-2xl font-bold text-red-400 font-[var(--font-bebas)] mt-2 animate-count">{formatCurrency(annualCosts)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-pw-text-dim">Utile Annuo Stimato</p>
            <p className={`text-2xl font-bold font-[var(--font-bebas)] mt-2 animate-count ${annualNetProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(annualNetProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SEZIONE 4: DETTAGLIO DIPENDENTI ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users size={18} className="text-pw-accent" />
            <h2 className="text-lg font-semibold text-pw-text">Costo Dipendenti (Dettaglio Fiscale)</h2>
            {hasRealData && <Badge className="bg-green-500/15 text-green-400 ml-2">Dati reali da buste paga</Badge>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pw-border text-[10px] uppercase tracking-widest text-pw-text-dim">
                <th className="text-left py-3">Dipendente</th>
                <th className="text-right py-3">Lordo/Mese</th>
                <th className="text-right py-3">INPS Azienda</th>
                <th className="text-right py-3">TFR</th>
                <th className="text-right py-3 font-bold text-red-400">Costo Azienda</th>
                <th className="text-right py-3">INPS Dip.</th>
                <th className="text-right py-3">IRPEF</th>
                <th className="text-right py-3 font-bold text-green-400">Netto Dip.</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                // Use real payslip data if available
                const realData = latestPayslips.find(p => p.employee_id === emp.id);
                const lordo = realData ? realData.lordo_mensile : emp.costs.monthlyGross;
                const inpsAz = realData ? realData.inps_azienda : emp.costs.inpsEmployer;
                const tfr = realData ? realData.tfr_accantonamento : emp.costs.tfr;
                const costoAz = realData ? (realData.costo_totale_azienda || lordo + inpsAz + tfr) : emp.costs.monthlyCostCompany;
                const inpsDip = realData ? realData.inps_dipendente : emp.costs.inpsEmployee;
                const irpef = realData ? realData.irpef : emp.costs.irpef;
                const netto = realData ? realData.netto_mensile : emp.costs.monthlyNet;
                return (
                  <tr key={emp.id} className="border-b border-pw-border/50 row-hover">
                    <td className="py-3">
                      <p className="font-medium text-pw-text">{emp.full_name}</p>
                      <p className="text-[10px] text-pw-text-dim">
                        {emp.contract_type === 'indeterminato' ? 'Indeterminato' : emp.contract_type}
                        {realData ? ' · dati reali' : ' · stima'}
                      </p>
                    </td>
                    <td className="text-right text-pw-text-muted">{formatCurrency(lordo)}</td>
                    <td className="text-right text-pw-text-dim">{formatCurrency(inpsAz)}</td>
                    <td className="text-right text-pw-text-dim">{formatCurrency(tfr)}</td>
                    <td className="text-right font-semibold text-red-400">{formatCurrency(costoAz)}</td>
                    <td className="text-right text-pw-text-dim">{formatCurrency(inpsDip)}</td>
                    <td className="text-right text-pw-text-dim">{formatCurrency(irpef)}</td>
                    <td className="text-right font-semibold text-green-400">{formatCurrency(netto)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-pw-border font-bold">
                <td className="py-3 text-pw-text">TOTALE</td>
                <td className="text-right text-pw-text">{formatCurrency(totalMonthlySalariesGross)}</td>
                <td className="text-right text-pw-text-dim">{formatCurrency(totalMonthlyINPS)}</td>
                <td className="text-right text-pw-text-dim">{formatCurrency(totalMonthlyTFR)}</td>
                <td className="text-right text-red-400">{formatCurrency(totalMonthlySalariesCostCompany)}</td>
                <td className="text-right text-pw-text-dim">{formatCurrency(hasRealData ? latestPayslips.reduce((s, p) => s + p.inps_dipendente, 0) : employees.reduce((s, e) => s + e.costs.inpsEmployee, 0))}</td>
                <td className="text-right text-pw-text-dim">{formatCurrency(hasRealData ? latestPayslips.reduce((s, p) => s + p.irpef, 0) : employees.reduce((s, e) => s + e.costs.irpef, 0))}</td>
                <td className="text-right text-green-400">{formatCurrency(totalMonthlyNetEmployees)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* ═══ SEZIONE 5: REDDITIVITA PER CLIENTE ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-pw-accent" />
            <h2 className="text-lg font-semibold text-pw-text">Redditivita per Cliente</h2>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pw-border text-[10px] uppercase tracking-widest text-pw-text-dim">
                <th className="text-left py-3">Cliente</th>
                <th className="text-right py-3">Fee Mensile</th>
                <th className="text-right py-3">Totale Incassato</th>
                <th className="text-right py-3">Da Incassare</th>
                <th className="text-right py-3">Tasso Incasso</th>
              </tr>
            </thead>
            <tbody>
              {clientProfitability.map(client => {
                const collectionRate = client.totalExpected > 0 ? (client.totalPaid / client.totalExpected) * 100 : 0;
                return (
                  <tr key={client.clientId} className="border-b border-pw-border/50 row-hover">
                    <td className="py-3 font-medium text-pw-text">{client.clientName}</td>
                    <td className="text-right text-pw-text-muted">{formatCurrency(client.monthlyFee)}</td>
                    <td className="text-right text-green-400 font-medium">{formatCurrency(client.totalPaid)}</td>
                    <td className="text-right text-orange-400">{formatCurrency(client.totalExpected - client.totalPaid)}</td>
                    <td className="text-right">
                      <Badge className={collectionRate >= 80 ? 'bg-green-500/15 text-green-400' : collectionRate >= 50 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'}>
                        {collectionRate.toFixed(0)}%
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-pw-border font-bold">
                <td className="py-3 text-pw-text">TOTALE</td>
                <td className="text-right text-pw-text">{formatCurrency(summary.mrr)}</td>
                <td className="text-right text-green-400">{formatCurrency(summary.totalReceived)}</td>
                <td className="text-right text-orange-400">{formatCurrency(summary.totalPending)}</td>
                <td className="text-right">
                  <Badge className="bg-pw-accent/15 text-pw-accent">
                    {summary.totalExpected > 0 ? ((summary.totalReceived / summary.totalExpected) * 100).toFixed(0) : 0}%
                  </Badge>
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* ═══ SEZIONE 6: SPESE OPERATIVE ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-pw-accent" />
              <h2 className="text-lg font-semibold text-pw-text">Spese Operative</h2>
              <Badge className="bg-pw-accent/15 text-pw-accent">{formatCurrency(monthlyExpenses)}/mese</Badge>
            </div>
            <Button onClick={openAddExpense} size="sm">
              <Plus size={14} />
              Aggiungi Spesa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {expenses.length > 0 ? (
            <div className="space-y-2">
              {expenses.map(exp => (
                <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl bg-pw-surface-2 hover:bg-pw-surface-3 transition-colors duration-200 ease-out group">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-pw-text">{exp.name}</p>
                      <Badge className="text-[9px]">
                        {EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label || exp.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {exp.vendor && <span className="text-[10px] text-pw-text-dim">{exp.vendor}</span>}
                      <span className="text-[10px] text-pw-text-dim">
                        {exp.frequency === 'monthly' ? 'Mensile' : exp.frequency === 'quarterly' ? 'Trimestrale' : exp.frequency === 'yearly' ? 'Annuale' : 'Una tantum'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-pw-text">{formatCurrency(exp.amount)}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditExpense(exp)} className="p-1 rounded hover:bg-pw-surface text-pw-text-dim hover:text-pw-accent">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDeleteExpense(exp.id)} className="p-1 rounded hover:bg-pw-surface text-pw-text-dim hover:text-red-400">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Wallet size={40} className="text-pw-text-dim mx-auto mb-2" />
              <p className="text-sm text-pw-text-muted">Nessuna spesa operativa</p>
              <p className="text-xs text-pw-text-dim mt-1">Aggiungi affitto, licenze software, utenze, ecc.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ SEZIONE 7: RIEPILOGO QUICK ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        <Card>
          <CardContent className="p-4 text-center">
            <Briefcase size={20} className="text-pw-text-dim mx-auto mb-1" />
            <p className="text-lg font-bold text-pw-text">{summary.activeClients}</p>
            <p className="text-[10px] text-pw-text-dim">Clienti Attivi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users size={20} className="text-pw-text-dim mx-auto mb-1" />
            <p className="text-lg font-bold text-pw-text">{employees.length}</p>
            <p className="text-[10px] text-pw-text-dim">Dipendenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Euro size={20} className="text-pw-text-dim mx-auto mb-1" />
            <p className="text-lg font-bold text-pw-text">{formatCurrency(totalMonthlySalariesCostCompany)}</p>
            <p className="text-[10px] text-pw-text-dim">Costo Personale/Mese</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <PieChart size={20} className="text-pw-text-dim mx-auto mb-1" />
            <p className={`text-lg font-bold ${monthlyMarginPct >= 20 ? 'text-green-400' : monthlyMarginPct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
              {monthlyMarginPct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-pw-text-dim">Margine Operativo</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ SEZIONE 8: BUSTE PAGA REALI ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-pw-accent" />
              <h2 className="text-lg font-semibold text-pw-text">Buste Paga</h2>
              <Badge className="bg-pw-accent/15 text-pw-accent">{payslips.length} registrate</Badge>
            </div>
            <Button onClick={() => { setPayslipFile(null); setParsedPayslips(null); setShowPayslipUpload(true); }} size="sm">
              <Upload size={14} />
              Carica Buste Paga (PDF)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {payslips.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pw-border text-[10px] uppercase tracking-widest text-pw-text-dim">
                  <th className="text-left py-3">Dipendente</th>
                  <th className="text-left py-3">Mese</th>
                  <th className="text-right py-3">Lordo</th>
                  <th className="text-right py-3">INPS Dip.</th>
                  <th className="text-right py-3">IRPEF</th>
                  <th className="text-right py-3 text-green-400">Netto Busta</th>
                  <th className="text-right py-3">INPS Az.</th>
                  <th className="text-right py-3">TFR</th>
                  <th className="text-right py-3 text-red-400">Costo Azienda</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {payslips.map(ps => (
                  <tr key={ps.id} className="border-b border-pw-border/50 row-hover">
                    <td className="py-2 font-medium text-pw-text">{employees.find(e => e.id === ps.employee_id)?.full_name || '—'}</td>
                    <td className="py-2 text-pw-text-muted">{new Date(ps.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</td>
                    <td className="py-2 text-right text-pw-text-muted">{formatCurrency(ps.lordo_mensile)}</td>
                    <td className="py-2 text-right text-pw-text-dim">{formatCurrency(ps.inps_dipendente)}</td>
                    <td className="py-2 text-right text-pw-text-dim">{formatCurrency(ps.irpef)}</td>
                    <td className="py-2 text-right font-semibold text-green-400">{formatCurrency(ps.netto_mensile)}</td>
                    <td className="py-2 text-right text-pw-text-dim">{formatCurrency(ps.inps_azienda)}</td>
                    <td className="py-2 text-right text-pw-text-dim">{formatCurrency(ps.tfr_accantonamento)}</td>
                    <td className="py-2 text-right font-semibold text-red-400">{formatCurrency(ps.costo_totale_azienda || 0)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {ps.attachment_url && (
                          <a
                            href={ps.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-pw-surface-3 text-pw-accent"
                            title="Scarica busta paga"
                          >
                            <FileText size={12} />
                          </a>
                        )}
                        <button onClick={() => handleDeletePayslip(ps.id)} className="p-1 rounded hover:bg-pw-surface-3 text-pw-text-dim hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8">
              <FileText size={40} className="text-pw-text-dim mx-auto mb-2" />
              <p className="text-sm text-pw-text-muted">Nessuna busta paga inserita</p>
              <p className="text-xs text-pw-text-dim mt-1">Inserisci i dati delle buste paga per avere il costo reale dei dipendenti</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ SEZIONE 9: ANALISI NETTO FATTURE ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-pw-accent" />
            <h2 className="text-lg font-semibold text-pw-text">Analisi Netto Fatture Emesse</h2>
          </div>
          <p className="text-xs text-pw-text-dim mt-1">Per ogni fattura: imponibile - IRES (24%) - IRAP (3.9%) = netto azienda</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {invoices.length > 0 ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-pw-border text-[10px] uppercase tracking-widest text-pw-text-dim">
                    <th className="text-left py-3">Fattura</th>
                    <th className="text-left py-3">Cliente</th>
                    <th className="text-left py-3">Stato</th>
                    <th className="text-right py-3">Imponibile</th>
                    <th className="text-right py-3">IVA ({invoices[0]?.vat_rate || 22}%)</th>
                    <th className="text-right py-3">Totale</th>
                    <th className="text-right py-3 text-orange-400">IRES (24%)</th>
                    <th className="text-right py-3 text-orange-400">IRAP (3.9%)</th>
                    <th className="text-right py-3 text-green-400 font-bold">Netto Azienda</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const net = calculateInvoiceNet(inv);
                    const client = inv.client as Client | undefined;
                    return (
                      <tr key={inv.id} className="border-b border-pw-border/50 row-hover">
                        <td className="py-2 font-mono text-xs text-pw-accent">{inv.invoice_number}</td>
                        <td className="py-2 text-pw-text">{client?.ragione_sociale || client?.company || client?.name || '—'}</td>
                        <td className="py-2">
                          <Badge className={inv.status === 'paid' ? 'bg-green-500/15 text-green-400' : inv.status === 'overdue' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'}>
                            {inv.status === 'paid' ? 'Pagata' : inv.status === 'sent' ? 'Inviata' : inv.status === 'overdue' ? 'Scaduta' : inv.status === 'draft' ? 'Bozza' : inv.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-right text-pw-text-muted">{formatCurrency(net.imponibile)}</td>
                        <td className="py-2 text-right text-pw-text-dim">{formatCurrency(net.iva)}</td>
                        <td className="py-2 text-right text-pw-text">{formatCurrency(net.totaleIncIva)}</td>
                        <td className="py-2 text-right text-orange-400">-{formatCurrency(net.ires)}</td>
                        <td className="py-2 text-right text-orange-400">-{formatCurrency(net.irap)}</td>
                        <td className="py-2 text-right font-bold text-green-400">{formatCurrency(net.nettoAzienda)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-pw-border font-bold">
                    <td colSpan={3} className="py-3 text-pw-text">TOTALE</td>
                    <td className="text-right text-pw-text">{formatCurrency(invoices.reduce((s, i) => s + i.subtotal, 0))}</td>
                    <td className="text-right text-pw-text-dim">{formatCurrency(invoices.reduce((s, i) => s + i.vat_amount, 0))}</td>
                    <td className="text-right text-pw-text">{formatCurrency(invoices.reduce((s, i) => s + i.total, 0))}</td>
                    <td className="text-right text-orange-400">-{formatCurrency(invoices.reduce((s, i) => s + calculateInvoiceNet(i).ires, 0))}</td>
                    <td className="text-right text-orange-400">-{formatCurrency(invoices.reduce((s, i) => s + calculateInvoiceNet(i).irap, 0))}</td>
                    <td className="text-right text-green-400">{formatCurrency(invoices.reduce((s, i) => s + calculateInvoiceNet(i).nettoAzienda, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          ) : (
            <div className="text-center py-8">
              <Receipt size={40} className="text-pw-text-dim mx-auto mb-2" />
              <p className="text-sm text-pw-text-muted">Nessuna fattura emessa</p>
              <p className="text-xs text-pw-text-dim mt-1">Le fatture create nella sezione Fatturazione appariranno qui con l&apos;analisi del netto</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ MODAL CARICA BUSTE PAGA ═══ */}
      <Modal
        open={showPayslipUpload}
        onClose={() => { setShowPayslipUpload(false); setPayslipFile(null); setParsedPayslips(null); }}
        title="Carica Buste Paga"
        size="lg"
      >
        <div className="space-y-4">
          {!parsedPayslips ? (
            <>
              <div className="p-3 rounded-xl bg-pw-accent/10 text-pw-accent text-sm">
                Carica il PDF con le buste paga dei dipendenti. L&apos;AI analizzer&agrave; il documento e estrarra&apos; automaticamente tutti i dati (lordo, netto, INPS, IRPEF, TFR, ecc.)
              </div>

              <div className="border-2 border-dashed border-pw-border rounded-xl p-8 text-center hover:border-pw-accent/50 transition-colors duration-200 ease-out">
                <Upload size={40} className="text-pw-text-dim mx-auto mb-3" />
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPayslipFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-pw-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-pw-accent/10 file:text-pw-accent hover:file:bg-pw-accent/20 file:cursor-pointer"
                />
                {payslipFile && (
                  <p className="text-sm text-pw-text mt-3">
                    {payslipFile.name} <span className="text-pw-text-dim">({(payslipFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </p>
                )}
              </div>

              <Button
                onClick={handleParsePayslip}
                loading={parsingPayslip}
                disabled={!payslipFile}
                className="w-full"
              >
                <Sparkles size={16} />
                {parsingPayslip ? 'Analisi AI in corso...' : 'Analizza con AI'}
              </Button>
            </>
          ) : (
            <>
              <div className="p-3 rounded-xl bg-green-500/10 text-green-400 text-sm font-medium">
                {parsedPayslips.length} buste paga trovate nel documento
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {parsedPayslips.map((ps, i) => {
                  const p = ps as Record<string, unknown>;
                  const matched = !!p.employee_id;
                  return (
                    <div key={i} className={`p-4 rounded-xl border ${matched ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {matched ? <CheckCircle size={14} className="text-green-400" /> : <AlertTriangle size={14} className="text-red-400" />}
                          <span className="font-semibold text-pw-text">{String(p.employee_name || 'Sconosciuto')}</span>
                        </div>
                        <span className="text-xs text-pw-text-dim">{String(p.month || '')}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-pw-text-dim">Lordo</span>
                          <p className="font-medium text-pw-text">{formatCurrency(Number(p.lordo_mensile) || 0)}</p>
                        </div>
                        <div>
                          <span className="text-pw-text-dim">Netto</span>
                          <p className="font-medium text-green-400">{formatCurrency(Number(p.netto_mensile) || 0)}</p>
                        </div>
                        <div>
                          <span className="text-pw-text-dim">INPS Az.</span>
                          <p className="font-medium text-pw-text-muted">{formatCurrency(Number(p.inps_azienda) || 0)}</p>
                        </div>
                        <div>
                          <span className="text-pw-text-dim">Costo Azienda</span>
                          <p className="font-medium text-red-400">{formatCurrency((Number(p.lordo_mensile) || 0) + (Number(p.inps_azienda) || 0) + (Number(p.tfr_accantonamento) || 0) + (Number(p.inail) || 0))}</p>
                        </div>
                      </div>
                      {!matched && (
                        <p className="text-[10px] text-red-400 mt-2">Dipendente non trovato nel sistema - non verra salvato</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setParsedPayslips(null)} className="flex-1">
                  Ricarica PDF
                </Button>
                <Button
                  onClick={handleSaveAllPayslips}
                  loading={savingPayslips}
                  disabled={!parsedPayslips.some(p => !!(p as Record<string, unknown>).employee_id)}
                  className="flex-1"
                >
                  <CheckCircle size={14} />
                  Salva {parsedPayslips.filter(p => !!(p as Record<string, unknown>).employee_id).length} Buste Paga
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ═══ MODAL SPESE ═══ */}
      <Modal
        open={showExpenseForm}
        onClose={() => { setShowExpenseForm(false); resetExpenseForm(); }}
        title={editingExpense ? 'Modifica Spesa' : 'Nuova Spesa Operativa'}
      >
        <div className="space-y-4">
          <Input
            id="expense-name"
            label="Nome *"
            value={expenseForm.name}
            onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })}
            placeholder="es. Canone Aruba, Licenza Adobe, Affitto ufficio"
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              id="expense-category"
              label="Categoria"
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              options={EXPENSE_CATEGORIES}
            />
            <Input
              id="expense-amount"
              label="Importo (EUR) *"
              type="number"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              placeholder="es. 49.99"
            />
          </div>
          <Select
            id="expense-frequency"
            label="Frequenza"
            value={expenseForm.frequency}
            onChange={(e) => setExpenseForm({ ...expenseForm, frequency: e.target.value })}
            options={[
              { value: 'monthly', label: 'Mensile' },
              { value: 'quarterly', label: 'Trimestrale' },
              { value: 'yearly', label: 'Annuale' },
              { value: 'one_time', label: 'Una tantum' },
            ]}
          />
          <Input
            id="expense-vendor"
            label="Fornitore"
            value={expenseForm.vendor}
            onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
            placeholder="es. Adobe, Aruba, Telecom"
          />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }} className="flex-1">Annulla</Button>
            <Button onClick={handleSaveExpense} loading={savingExpense} disabled={!expenseForm.name || !expenseForm.amount} className="flex-1">
              {editingExpense ? 'Salva Modifiche' : 'Aggiungi Spesa'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </AdminGate>
  );
}
