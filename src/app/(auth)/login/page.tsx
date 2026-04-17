'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 2FA state
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Se arriviamo con ?verify=2fa, mostra direttamente lo step 2FA
  useEffect(() => {
    if (searchParams.get('verify') === '2fa') {
      setStep('2fa');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    const supabase = createClient();
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Email o password non corretti. Verifica e riprova.');
      setLoading(false);
      return;
    }

    // Controlla se l'utente ha la 2FA attiva
    try {
      const res = await fetch('/api/auth/2fa/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id }),
      });
      const result = await res.json();

      if (result.enabled) {
        // Mostra lo step 2FA
        setStep('2fa');
        setLoading(false);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        return;
      }
    } catch {
      // Se errore nel check 2FA, procedi normalmente
    }

    router.push('/dashboard');
    router.refresh();
  };

  const handleTotpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // solo numeri

    const newCode = [...totpCode];
    newCode[index] = value.slice(-1); // prendi solo l'ultimo carattere
    setTotpCode(newCode);

    // Auto-focus sul prossimo input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleTotpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !totpCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleTotpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newCode = pastedData.split('');
      setTotpCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify2FA = async () => {
    const code = totpCode.join('');
    if (code.length !== 6) {
      setError('Inserisci il codice completo di 6 cifre');
      return;
    }

    setVerifying2FA(true);
    setError('');

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Codice non valido');
        setTotpCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setVerifying2FA(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Errore di connessione');
      setVerifying2FA(false);
    }
  };

  // Auto-submit quando tutte le 6 cifre sono inserite
  useEffect(() => {
    if (step === '2fa' && totpCode.every(d => d !== '') && !verifying2FA) {
      handleVerify2FA();
    }
  }, [totpCode, step]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-pw-bg px-4 relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-pw-accent/[0.07] to-transparent blur-3xl animate-float" />
      <div className="absolute bottom-[-30%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-tl from-pw-red/[0.06] to-transparent blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-gradient-to-bl from-pw-cyan/[0.04] to-transparent blur-3xl animate-float" style={{ animationDelay: '-1.5s' }} />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="w-full max-w-[420px] relative z-10 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-block mb-4">
            <Image
              src="/logo.png"
              alt="PiraWeb"
              width={180}
              height={85}
              className="mx-auto drop-shadow-[0_0_30px_rgba(255,209,8,0.15)]"
              priority
            />
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-pw-text-dim font-medium font-[var(--font-dm-serif)] italic">
            Piattaforma Gestionale
          </p>
        </div>

        {/* Login card */}
        <div className="glass rounded-3xl p-8 shadow-2xl shadow-black/30">
          {/* Gradient border effect */}
          <div className="absolute inset-0 rounded-3xl p-px bg-gradient-to-br from-pw-accent/20 via-transparent to-pw-red/20 -z-10 opacity-60" />

          {step === 'credentials' ? (
            <>
              <h2 className="text-xl font-[var(--font-syne)] font-bold text-pw-text mb-1">
                Bentornato
              </h2>
              <p className="text-sm text-pw-text-dim mb-8">
                Accedi al tuo spazio di lavoro
              </p>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[10px] uppercase tracking-[0.1em] font-semibold text-pw-text-muted mb-2"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3.5 rounded-xl border border-pw-border/60 bg-pw-surface-2/60 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/20 focus:border-pw-accent/40 outline-none transition-all duration-200 text-sm hover:border-pw-border-hover"
                    placeholder="email@piraweb.it"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-[10px] uppercase tracking-[0.1em] font-semibold text-pw-text-muted mb-2"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3.5 rounded-xl border border-pw-border/60 bg-pw-surface-2/60 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/20 focus:border-pw-accent/40 outline-none transition-all duration-200 text-sm pr-12 hover:border-pw-border-hover"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-pw-text-dim hover:text-pw-text transition-colors p-1"
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div role="alert" aria-live="assertive" className="bg-red-500/8 border border-red-500/15 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2.5 animate-slide-up">
                    <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
                    </div>
                    <span className="text-[13px]">{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-pw-accent to-[#FFBF00] hover:from-pw-accent-hover hover:to-[#FFD108] text-[#0A263A] font-bold py-3.5 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-[13px] uppercase tracking-[0.08em] shadow-[0_4px_20px_-4px_rgba(255,209,8,0.25)] hover:shadow-[0_8px_30px_-4px_rgba(255,209,8,0.35)] active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    <>
                      Accedi
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Step 2FA */
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-pw-accent/10 flex items-center justify-center">
                  <ShieldCheck size={20} className="text-pw-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-[var(--font-syne)] font-bold text-pw-text">
                    Verifica 2FA
                  </h2>
                  <p className="text-xs text-pw-text-dim">
                    Autenticazione a due fattori
                  </p>
                </div>
              </div>
              <p className="text-sm text-pw-text-muted mb-6 mt-4">
                Inserisci il codice a 6 cifre dalla tua app Authenticator
              </p>

              <div className="space-y-5">
                {/* 6 input boxes per il codice TOTP */}
                <div className="flex justify-center gap-2.5">
                  {totpCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleTotpChange(i, e.target.value)}
                      onKeyDown={(e) => handleTotpKeyDown(i, e)}
                      onPaste={i === 0 ? handleTotpPaste : undefined}
                      className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-pw-border/60 bg-pw-surface-2/60 text-pw-text focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 hover:border-pw-border-hover"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                {error && (
                  <div role="alert" aria-live="assertive" className="bg-red-500/8 border border-red-500/15 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2.5 animate-slide-up">
                    <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
                    </div>
                    <span className="text-[13px]">{error}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleVerify2FA}
                  disabled={verifying2FA || totpCode.some(d => d === '')}
                  className="w-full bg-gradient-to-r from-pw-accent to-[#FFBF00] hover:from-pw-accent-hover hover:to-[#FFD108] text-[#0A263A] font-bold py-3.5 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-[13px] uppercase tracking-[0.08em] shadow-[0_4px_20px_-4px_rgba(255,209,8,0.25)] hover:shadow-[0_8px_30px_-4px_rgba(255,209,8,0.35)] active:scale-[0.98]"
                >
                  {verifying2FA ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Verifica in corso...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} />
                      Verifica Codice
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    setStep('credentials');
                    setTotpCode(['', '', '', '', '', '']);
                    setError('');
                    router.replace('/login');
                  }}
                  className="w-full text-sm text-pw-text-dim hover:text-pw-text transition-colors flex items-center justify-center gap-2 py-2"
                >
                  <ArrowLeft size={14} />
                  Torna al login
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[9px] uppercase tracking-[0.2em] text-pw-text-dim mt-8 font-medium">
          PiraWeb Gestionale &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
