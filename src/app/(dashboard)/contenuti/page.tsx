'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, FileEdit, Sparkles, Layers, Zap, LayoutTemplate, Repeat } from 'lucide-react';

// Lazy import delle pagine esistenti
import SocialCalendarPage from '../social-calendar/page';
import BriefsPage from '../briefs/page';
import AIPage from '../ai/page';
import AIContentPage from '../ai-content/page';
import AutomationsPage from '../automations/page';
import TemplatesPage from '../templates/page';
import RecurringTasksPage from '../recurring-tasks/page';

const tabs = [
  { id: 'piano', label: 'Piano Editoriale', icon: Calendar },
  { id: 'brief', label: 'Brief Creativi', icon: FileEdit },
  { id: 'ai', label: 'AI Assistant', icon: Sparkles },
  { id: 'ai-bulk', label: 'AI Contenuti', icon: Layers },
  { id: 'automazioni', label: 'Automazioni', icon: Zap },
  { id: 'template', label: 'Template', icon: LayoutTemplate },
  { id: 'ricorrenti', label: 'Task Ricorrenti', icon: Repeat },
];

function ContenutiContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'piano';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
          Contenuti
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Piano editoriale, brief creativi e assistente AI
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
        {activeTab === 'piano' && <SocialCalendarPage />}
        {activeTab === 'brief' && <BriefsPage />}
        {activeTab === 'ai' && <AIPage />}
        {activeTab === 'ai-bulk' && <AIContentPage />}
        {activeTab === 'automazioni' && <AutomationsPage />}
        {activeTab === 'template' && <TemplatesPage />}
        {activeTab === 'ricorrenti' && <RecurringTasksPage />}
      </div>
    </div>
  );
}

export default function ContenutiPage() {
  return (
    <Suspense>
      <ContenutiContent />
    </Suspense>
  );
}
