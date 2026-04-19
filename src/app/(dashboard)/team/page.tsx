'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { MessageSquare, Video, Timer, Clock, CalendarDays, Network, Wrench } from 'lucide-react';

// Import delle pagine esistenti
import BachecaPage from '../bacheca/page';
import MeetingsPage from '../meetings/page';
import TimesheetPage from '../timesheet/page';
import PresenzePage from '../presenze/page';
import CalendarioPage from '../calendario/page';
import OrganigrammaPage from '../organigramma/page';
import ToolsPage from '../tools/page';

const tabs = [
  { id: 'bacheca', label: 'Bacheca', icon: MessageSquare },
  { id: 'meeting', label: 'Meeting', icon: Video },
  { id: 'timesheet', label: 'Timesheet', icon: Timer },
  { id: 'presenze', label: 'Presenze', icon: Clock },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'organigramma', label: 'Organigramma', icon: Network },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

function TeamContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'bacheca';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
          Team
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Bacheca, meeting, presenze e strumenti di team
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-pw-surface-2/50 border border-pw-border/40 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
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
        {activeTab === 'bacheca' && <BachecaPage />}
        {activeTab === 'meeting' && <MeetingsPage />}
        {activeTab === 'timesheet' && <TimesheetPage />}
        {activeTab === 'presenze' && <PresenzePage />}
        {activeTab === 'calendario' && <CalendarioPage />}
        {activeTab === 'organigramma' && <OrganigrammaPage />}
        {activeTab === 'tools' && <ToolsPage />}
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
