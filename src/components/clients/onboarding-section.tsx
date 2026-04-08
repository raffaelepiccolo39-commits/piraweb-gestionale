'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ClientOnboarding, ClientSocialCredentials } from '@/types/database';
import {
  ClipboardCheck,
  Check,
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
  const [credentials, setCredentials] = useState<ClientSocialCredentials | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [credForm, setCredForm] = useState({
    instagram_username: '', instagram_password: '',
    facebook_username: '', facebook_password: '',
    tiktok_username: '', tiktok_password: '',
  });

  useEffect(() => {
    fetchData();
  }, [clientId]);

  const fetchData = async () => {
    const [obRes, credRes] = await Promise.all([
      supabase.from('client_onboarding').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_social_credentials').select('*').eq('client_id', clientId).maybeSingle(),
    ]);
    setOnboarding(obRes.data as ClientOnboarding | null);
    const cred = credRes.data as ClientSocialCredentials | null;
    setCredentials(cred);
    if (cred) {
      setCredForm({
        instagram_username: cred.instagram_username || '',
        instagram_password: cred.instagram_password || '',
        facebook_username: cred.facebook_username || '',
        facebook_password: cred.facebook_password || '',
        tiktok_username: cred.tiktok_username || '',
        tiktok_password: cred.tiktok_password || '',
      });
    }
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

  const handleSaveCredentials = async () => {
    setSaving(true);
    const data = {
      client_id: clientId,
      instagram_username: credForm.instagram_username || null,
      instagram_password: credForm.instagram_password || null,
      facebook_username: credForm.facebook_username || null,
      facebook_password: credForm.facebook_password || null,
      tiktok_username: credForm.tiktok_username || null,
      tiktok_password: credForm.tiktok_password || null,
    };

    if (credentials) {
      await supabase.from('client_social_credentials').update(data).eq('id', credentials.id);
    } else {
      await supabase.from('client_social_credentials').insert(data);
    }
    setSaving(false);
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

      {/* Social credentials */}
      <CollapsibleCard
        title="Credenziali Social"
        icon={Share2}
        headerRight={
          <button
            onClick={() => setShowPasswords(!showPasswords)}
            className="p-2 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
            aria-label={showPasswords ? 'Nascondi password' : 'Mostra password'}
          >
            {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      >
        <div className="space-y-4">
          {/* Instagram */}
          <div>
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
              <div className="w-4 h-4 rounded bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-500" />
              Instagram
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={credForm.instagram_username}
                onChange={(e) => setCredForm({ ...credForm, instagram_username: e.target.value })}
                placeholder="Username"
                className="px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
              />
              <input
                type={showPasswords ? 'text' : 'password'}
                value={credForm.instagram_password}
                onChange={(e) => setCredForm({ ...credForm, instagram_password: e.target.value })}
                placeholder="Password"
                className="px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
              />
            </div>
          </div>

          {/* Facebook */}
          <div>
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
              <div className="w-4 h-4 rounded bg-blue-600" />
              Facebook
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={credForm.facebook_username}
                onChange={(e) => setCredForm({ ...credForm, facebook_username: e.target.value })}
                placeholder="Username / Email"
                className="px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
              />
              <input
                type={showPasswords ? 'text' : 'password'}
                value={credForm.facebook_password}
                onChange={(e) => setCredForm({ ...credForm, facebook_password: e.target.value })}
                placeholder="Password"
                className="px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
              />
            </div>
          </div>

          {/* TikTok */}
          <div>
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
              <div className="w-4 h-4 rounded bg-black border border-pw-border" />
              TikTok
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={credForm.tiktok_username}
                onChange={(e) => setCredForm({ ...credForm, tiktok_username: e.target.value })}
                placeholder="Username"
                className="px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
              />
              <input
                type={showPasswords ? 'text' : 'password'}
                value={credForm.tiktok_password}
                onChange={(e) => setCredForm({ ...credForm, tiktok_password: e.target.value })}
                placeholder="Password"
                className="px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim text-sm outline-none focus:ring-2 focus:ring-pw-accent/30"
              />
            </div>
          </div>

          <Button onClick={handleSaveCredentials} loading={saving}>
            <Save size={14} />
            Salva Credenziali
          </Button>
        </div>
      </CollapsibleCard>
    </div>
  );
}
