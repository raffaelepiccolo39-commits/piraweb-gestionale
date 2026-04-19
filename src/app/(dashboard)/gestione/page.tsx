'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { AdminGate } from '@/components/ui/admin-gate';
import { Target, Crown, Calculator, Sparkles, Search, BarChart3, Euro, Receipt } from 'lucide-react';

// Import delle pagine esistenti
import CRMPage from '../crm/page';
import DirectionPage from '../direzione/page';
import CFOPage from '../cfo/page';
import LeadAIPage from '../lead-ai/page';
import LeadFinderPage from '../lead-finder/page';
import MarketResearchPage from '../market-research/page';
import CapacityPage from '../capacity/page';
import ProfitabilityPage from '../profitability/page';
import InvoicesPage from '../invoices/page';
import CashflowPage from '../cashflow/page';
import AnalyticsPage from '../analytics/page';

const tabs = [
  { id: 'crm', label: 'CRM', icon: Target },
  { id: 'direzione', label: 'Direzione', icon: Crown },
  { id: 'cfo', label: 'CFO', icon: Calculator },
  { id: 'lead-ai', label: 'Lead AI', icon: Sparkles },
  { id: 'lead-finder', label: 'Lead Finder', icon: Search },
  { id: 'mercato', label: 'Mercato', icon: BarChart3 },
  { id: 'capacity', label: 'Capacità', icon: BarChart3 },
  { id: 'profitability', label: 'Profitto', icon: Euro },
  { id: 'invoices', label: 'Fatture', icon: Receipt },
  { id: 'cashflow', label: 'Cashflow', icon: Euro },
  { id: 'analytics', label: 'Efficienza', icon: BarChart3 },
];

function GestioneContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'crm';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { profile } = useAuth();

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Crown size={40} className="mx-auto text-pw-text-dim mb-3" />
          <p className="text-pw-text font-semibold">Accesso non autorizzato</p>
          <p className="text-sm text-pw-text-muted mt-1">Solo gli amministratori possono accedere a questa sezione</p>
        </div>
      </div>
    );
  }

  return (
    <AdminGate>
      <div className="space-y-6 animate-slide-up">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Gestione
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">
            CRM, direzione, finanze e lead generation
          </p>
        </div>

        {/* Tab bar — scrollable */}
        <div className="flex gap-1 p-1 rounded-xl bg-pw-surface-2/50 border border-pw-border/40 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all duration-200 ease-out',
                  activeTab === tab.id
                    ? 'bg-pw-accent text-[#0A263A] shadow-sm'
                    : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
                )}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'crm' && <CRMPage />}
          {activeTab === 'direzione' && <DirectionPage />}
          {activeTab === 'cfo' && <CFOPage />}
          {activeTab === 'lead-ai' && <LeadAIPage />}
          {activeTab === 'lead-finder' && <LeadFinderPage />}
          {activeTab === 'mercato' && <MarketResearchPage />}
          {activeTab === 'capacity' && <CapacityPage />}
          {activeTab === 'profitability' && <ProfitabilityPage />}
          {activeTab === 'invoices' && <InvoicesPage />}
          {activeTab === 'cashflow' && <CashflowPage />}
          {activeTab === 'analytics' && <AnalyticsPage />}
        </div>
      </div>
    </AdminGate>
  );
}

export default function GestionePage() {
  return (
    <Suspense>
      <GestioneContent />
    </Suspense>
  );
}
