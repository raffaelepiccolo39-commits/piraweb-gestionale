'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Check, ArrowRight, KeyRound, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import type { UserRole } from '@/types/database';

type Step = 'password' | 'profile';

interface Props {
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Amministratore',
  social_media_manager: 'Social Media Manager',
  content_creator: 'Content Creator',
  graphic_social: 'Graphic Social',
  graphic_brand: 'Graphic Brand',
};

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) s++;
  const score = Math.min(s, 3) as 0 | 1 | 2 | 3;
  const labels = ['Debole', 'Media', 'Buona', 'Forte'];
  const colors = ['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
  return { score, label: labels[score], color: colors[score] };
}

export default function OnboardingWizard(props: Props) {
  const router = useRouter();
  const isAdmin = props.role === 'admin';

  // Se la password è già stata cambiata (es. utente torna sulla pagina), salta lo step
  const initialStep: Step = props.mustChangePassword ? 'password' : 'profile';
  const [step, setStep] = useState<Step>(initialStep);

  // Step 1: password
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Step 2: profilo
  const [name, setName] = useState(props.fullName);
  const [avatar, setAvatar] = useState(props.avatarUrl || '');

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const strength = passwordStrength(pw);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    if (pw.length < 8) return setPwError('La password deve avere almeno 8 caratteri');
    if (pw !== pwConfirm) return setPwError('Le password non coincidono');
    setPwLoading(true);
    const res = await fetch('/api/onboarding/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    setPwLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setPwError(j.error || 'Errore aggiornamento password');
    }
    setStep('profile');
  }

  async function complete() {
    setCompleteError('');
    setCompleting(true);
    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name, avatar_url: avatar || null }),
    });
    if (!res.ok) {
      setCompleting(false);
      const j = await res.json().catch(() => ({}));
      return setCompleteError(j.error || 'Errore completamento onboarding');
    }
    router.push('/dashboard');
    router.refresh();
  }

  const steps: { id: Step; label: string; icon: typeof KeyRound }[] = [
    { id: 'password', label: 'Password', icon: KeyRound },
    { id: 'profile', label: 'Profilo', icon: UserIcon },
  ];
  const currentIdx = steps.findIndex(s => s.id === step);

  return (
    <div className="min-h-screen flex items-center justify-center bg-pw-bg p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-pw-text" style={{ fontFamily: 'var(--font-syne)' }}>
            Benvenuto/a in PiraWeb
          </h1>
          <p className="text-sm text-pw-text-muted mt-1">
            {props.fullName.split(' ')[0]} · {roleLabels[props.role]}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between mb-8 px-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${done ? 'bg-pw-accent text-[#0A263A]' : active ? 'bg-pw-accent/15 text-pw-accent border-2 border-pw-accent' : 'bg-pw-surface text-pw-text-muted border border-pw-border'}`}>
                    {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs ${active ? 'text-pw-text font-medium' : 'text-pw-text-muted'}`}>{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-5 ${done ? 'bg-pw-accent' : 'bg-pw-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-pw-surface border border-pw-border rounded-2xl p-8 shadow-sm">
          {step === 'password' && (
            <form onSubmit={submitPassword} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-pw-text mb-1">Imposta la tua password</h2>
                <p className="text-sm text-pw-text-muted">Scegli una password sicura. Sarà l&apos;unica con cui accederai.</p>
              </div>
              <div>
                <label htmlFor="nuova-password" className="block text-sm font-medium text-pw-text mb-1">Nuova password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-pw-bg border border-pw-border rounded-lg text-pw-text focus:outline-none focus:ring-2 focus:ring-pw-accent"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  id="nuova-password" />
                  <button
                type="button"
                aria-label={showPw ? 'Nascondi la password' : 'Mostra la password'}
                title={showPw ? 'Nascondi la password' : 'Mostra la password'}
                onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-pw-text-muted hover:text-pw-text">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pw.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-pw-border rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${strength.color}`} style={{ width: `${((strength.score + 1) / 4) * 100}%` }} />
                    </div>
                    <span className="text-xs text-pw-text-muted">{strength.label}</span>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="conferma-password" className="block text-sm font-medium text-pw-text mb-1">Conferma password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="w-full px-3 py-2 bg-pw-bg border border-pw-border rounded-lg text-pw-text focus:outline-none focus:ring-2 focus:ring-pw-accent"
                  autoComplete="new-password"
                  required
                id="conferma-password" />
              </div>
              {pwError && <p className="text-sm text-red-500">{pwError}</p>}
              <button
                type="submit"
                disabled={pwLoading}
                className="w-full bg-pw-accent text-[#0A263A] rounded-lg py-2.5 font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continua <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {step === 'profile' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-pw-text mb-1">Conferma il tuo profilo</h2>
                <p className="text-sm text-pw-text-muted">Verifica nome e (opzionale) URL della tua foto profilo.</p>
              </div>
              <div>
                <label htmlFor="nome-completo" className="block text-sm font-medium text-pw-text mb-1">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-pw-bg border border-pw-border rounded-lg text-pw-text focus:outline-none focus:ring-2 focus:ring-pw-accent"
                  required
                id="nome-completo" />
              </div>
              <div>
                <label htmlFor="url-foto-profilo-opzionale" className="block text-sm font-medium text-pw-text mb-1">URL foto profilo <span className="text-pw-text-muted font-normal">(opzionale)</span></label>
                <input
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-pw-bg border border-pw-border rounded-lg text-pw-text focus:outline-none focus:ring-2 focus:ring-pw-accent"
                id="url-foto-profilo-opzionale" />
                {avatar && (
                  <div className="mt-2 flex items-center gap-3">
                    <Image src={avatar} alt="preview" width={48} height={48} className="rounded-full object-cover" unoptimized />
                    <span className="text-xs text-pw-text-muted">Anteprima</span>
                  </div>
                )}
              </div>
              {completeError && <p className="text-sm text-red-500">{completeError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => complete()}
                  disabled={completing || !name.trim()}
                  className="flex-1 bg-pw-accent text-[#0A263A] rounded-lg py-2.5 font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Completa <Check className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-pw-text-muted mt-6">
          Hai problemi? Contatta <a href="mailto:info@piraweb.it" className="text-pw-accent hover:underline">info@piraweb.it</a>
        </p>
      </div>
    </div>
  );
}
