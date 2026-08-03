'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ClientOnboarding } from '@/types/database';
import {
  ClipboardCheck,
  Check,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Share2,
  ChevronDown,
} from 'lucide-react';

interface OnboardingSectionProps {
  clientId: string;
}

const CHECKLIST_ITEMS: { key: keyof ClientOnboarding; label: string }[] = [
  { key: 'contract_signed', label: 'Contratto firmato' },
  { key: 'logo_received', label: 'Logo ricevuto (vettoriale/PNG)' },
  { key: 'social_credentials', label: 'Credenziali social ricevute' },
  { key: 'social_accounts_access', label: 'Accesso account social verificato' },
  { key: 'brand_guidelines_received', label: 'Brand guidelines ricevute' },
  { key: 'first_meeting_done', label: 'Primo meeting effettuato' },
  { key: 'strategy_defined', label: 'Strategia definita' },
  { key: 'content_plan_created', label: 'Piano editoriale creato' },
];

function CollapsibleCard({
  title,
  icon: Icon,
  defaultOpen = false,
  headerRight,
  children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 sm:px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon size={20} className="text-pw-accent" />
          <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {headerRight && <div onClick={(e) => e.stopPropagation()}>{headerRight}</div>}
          <ChevronDown
            size={18}
            className={`text-pw-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

export function OnboardingSection({ clientId }: OnboardingSectionProps) {
  const supabase = createClient();
  const [onboarding, setOnboarding] = useState<ClientOnboarding | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [clientId]);

  const fetchData = async () => {
    const obRes = await supabase.from('client_onboarding').select('*').eq('client_id', clientId).maybeSingle();
    setOnboarding(obRes.data as ClientOnboarding | null);
  };

  const toggleCheck = async (key: keyof ClientOnboarding) => {
    const current = onboarding?.[key] as boolean || false;
    const update = { [key]: !current };

    if (onboarding) {
      await supabase.from('client_onboarding').update(update).eq('id', onboarding.id);
    } else {
      await supabase.from('client_onboarding').insert({ client_id: clientId, ...update });
    }
    fetchData();
  };


  const completedCount = CHECKLIST_ITEMS.filter((item) => onboarding?.[item.key] as boolean).length;
  const progressPct = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  return (
    <div className="space-y-4">
      {/* Onboarding checklist */}
      <CollapsibleCard
        title="Onboarding"
        icon={ClipboardCheck}
        headerRight={
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${progressPct === 100 ? 'text-green-400' : 'text-pw-text-muted'}`}>
              {completedCount}/{CHECKLIST_ITEMS.length}
            </span>
            <div className="w-20 h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressPct === 100 ? 'bg-green-500' : 'bg-pw-accent'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        }
      >
        <div className="divide-y divide-pw-border -mx-4 sm:-mx-6">
          {CHECKLIST_ITEMS.map((item) => {
            const checked = onboarding?.[item.key] as boolean || false;
            return (
              <button
                key={item.key}
                onClick={() => toggleCheck(item.key)}
                className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-pw-surface-2 transition-colors text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? 'bg-green-500 border-green-500' : 'border-pw-border'
                }`}>
                  {checked && <Check size={12} className="text-white" />}
                </div>
                <span className={`text-sm ${checked ? 'text-pw-text-muted line-through' : 'text-pw-text'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </CollapsibleCard>

      {/* Le credenziali stavano qui, in chiaro e solo per tre social. Ora
          vivono nella sezione Accessi: cifrate, per qualsiasi piattaforma e
          con la traccia di chi le legge. Qui resta il rimando, perche' e'
          durante l'onboarding che si raccolgono. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-pw-text">Credenziali del cliente</p>
            <p className="text-xs text-pw-text-muted mt-0.5">
              Sito, Instagram, Facebook, TikTok, LinkedIn — si archiviano nella sezione Accessi.
            </p>
          </div>
          <Link href={`/accessi?cliente=${clientId}`}>
            <Button variant="outline" size="sm">
              <KeyRound size={14} /> Vai agli Accessi
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
