'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { MessageSquare, Video, Clock, Network, Wrench, UserCog, BarChart3 } from 'lucide-react';

// Import delle pagine esistenti
import BachecaPage from '../bacheca/page';
import MeetingsPage from '../meetings/page';
import PresenzePage from '../presenze/page';
import OrganigrammaPage from '../organigramma/page';
import ToolsPage from '../tools/page';
import FreelancersPage from '../freelancers/page';
import CapacityPage from '../capacity/page';

interface TeamTab {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const tabs: TeamTab[] = [
  { id: 'bacheca', label: 'Bacheca', icon: MessageSquare },
  { id: 'meeting', label: 'Meeting', icon: Video },
  { id: 'presenze', label: 'Presenze', icon: Clock },
  { id: 'organigramma', label: 'Organigramma', icon: Network },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'freelancers', label: 'Freelancers', icon: UserCog, adminOnly: true },
  { id: 'capacity', label: 'Capacità', icon: BarChart3, adminOnly: true },
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
        {activeTab === 'bacheca' && <BachecaPage />}
        {activeTab === 'meeting' && <MeetingsPage />}
        {activeTab === 'presenze' && <PresenzePage />}
        {activeTab === 'organigramma' && <OrganigrammaPage />}
        {activeTab === 'tools' && <ToolsPage />}
        {activeTab === 'freelancers' && isAdmin && <FreelancersPage />}
        {activeTab === 'capacity' && isAdmin && <CapacityPage />}
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
