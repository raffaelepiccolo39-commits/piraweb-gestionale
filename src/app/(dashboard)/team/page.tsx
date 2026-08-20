'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader, PaginaIncorporata } from '@/components/ui/page-header';
import { MessageSquare, CalendarClock, Clock, Timer, BarChart3, Target } from 'lucide-react';

// Import delle pagine esistenti.
// La bacheca arriva da /tasks: bacheca ed elenco sono la stessa pagina, e
// /bacheca è solo un reindirizzamento. Importare quella qui dentro
// sbatterebbe fuori chi apre il tab.
import BachecaPage from '../tasks/page';
import PianificazionePage from '../pianificazione/page';
import PresenzePage from '../presenze/page';
import TimesheetPage from '../timesheet/page';
import CapacityPage from '../capacity/page';
import RendimentoPage from '../rendimento/page';

interface TeamTab {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const tabs: TeamTab[] = [
  { id: 'bacheca', label: 'Bacheca', icon: MessageSquare },
  { id: 'pianificazione', label: 'Pianificazione', icon: CalendarClock },
  { id: 'presenze', label: 'Presenze', icon: Clock },
  { id: 'timesheet', label: 'Timesheet', icon: Timer, adminOnly: true },
  { id: 'capacity', label: 'Capacità', icon: BarChart3, adminOnly: true },
  { id: 'rendimento', label: 'Rendimento', icon: Target, adminOnly: true },
];

function TeamContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'bacheca';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const visibleTabs = tabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <PageHeader
        title="Bacheca team"
        subtitle="Task, pianificazione, presenze e rendimento"
      />

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-pw-surface-2/50 border border-pw-border/40 overflow-x-auto no-scrollbar">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all duration-200 ease-out',
                activeTab === tab.id
                  ? 'bg-pw-accent text-[#0A263A] shadow-sm'
                  : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2'
              )}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        <PaginaIncorporata>
          {activeTab === 'bacheca' && <BachecaPage />}
          {activeTab === 'pianificazione' && <PianificazionePage />}
          {activeTab === 'presenze' && <PresenzePage />}
          {activeTab === 'timesheet' && isAdmin && <TimesheetPage />}
          {activeTab === 'capacity' && isAdmin && <CapacityPage />}
          {activeTab === 'rendimento' && isAdmin && <RendimentoPage />}
        </PaginaIncorporata>
      </div>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamContent />
    </Suspense>
  );
}
