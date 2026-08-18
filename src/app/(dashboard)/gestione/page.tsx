'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/ui/page-header';
import { Target, Crown, Calculator, Euro } from 'lucide-react';

// Import delle pagine esistenti
import CRMPage from '../crm/page';
import DirectionPage from '../direzione/page';
import CFOPage from '../cfo/page';
import CapacityPage from '../capacity/page';
import ProfitabilityPage from '../profitability/page';
import CashflowPage from '../cashflow/page';

const tabs = [
  { id: 'crm', label: 'CRM', icon: Target },
  { id: 'direzione', label: 'Direzione', icon: Crown },
  { id: 'cfo', label: 'CFO', icon: Calculator },
  // Capacità e Profitto leggono le stesse ore: la prima chiede quanto è
  // carico il team, la seconda quanto rendono quelle ore. Insieme
  // rispondono alla domanda vera — possiamo prendere questo cliente, e
  // ci conviene? Separate, duplicavano la tabella per dipendente.
  { id: 'profitto', label: 'Profitto e capacità', icon: Euro },
  { id: 'cashflow', label: 'Cashflow', icon: Euro },
];

function GestioneContent() {
  const searchParams = useSearchParams();
  const tabRichiesta = searchParams.get('tab') || 'crm';
  // I due nomi vecchi portano alla scheda unita: un link salvato non
  // deve aprire una pagina vuota.
  const initialTab = ['capacity', 'profitability'].includes(tabRichiesta) ? 'profitto' : tabRichiesta;
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
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <PageHeader
        title="Gestione"
        subtitle="CRM, direzione, finanze e lead generation"
      />

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
        {activeTab === 'profitto' && (
          <div className="space-y-8">
            <CapacityPage />
            <ProfitabilityPage />
          </div>
        )}
        {activeTab === 'cashflow' && <CashflowPage />}
      </div>
    </div>
  );
}

export default function GestionePage() {
  return (
    <Suspense>
      <GestioneContent />
    </Suspense>
  );
}
