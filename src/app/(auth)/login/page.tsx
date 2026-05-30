'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';

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

  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [verifying2FA, setVerifying2FA] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Email o password non corretti. Verifica e riprova.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/2fa/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id }),
      });
      const result = await res.json();

      if (result.enabled) {
        setStep('2fa');
        setLoading(false);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        return;
      }
    } catch {
      // se errore nel check 2FA, procedi normalmente
    }

    router.push('/dashboard');
    router.refresh();
  };

  const handleTotpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...totpCode];
    newCode[index] = value.slice(-1);
    setTotpCode(newCode);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
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

      const redirectParam = searchParams.get('redirect');
      const redirectTo = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
        ? redirectParam
        : '/dashboard';
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Errore di connessione');
      setVerifying2FA(false);
    }
  };

  useEffect(() => {
    if (step === '2fa' && totpCode.every(d => d !== '') && !verifying2FA) {
      handleVerify2FA();
    }
  }, [totpCode, step]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#F5F5F4] text-[#0F172A]">
      <div className="w-full max-w-[400px]">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <Image
              src="/logo-dark.png"
              alt="PiraWeb"
              width={120}
              height={28}
              className="object-contain"
              priority
            />
            <p className="text-sm text-gray-500 mt-3">
              Accedi con il tuo account aziendale
            </p>
          </div>

          {step === 'credentials' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-[#0F172A] placeholder:text-gray-400 focus:border-[#0A263A] focus:ring-2 focus:ring-[#0A263A]/10 outline-none transition-colors text-sm"
                  placeholder="nome@piraweb.it"
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <a
                    href="mailto:info@piraweb.it?subject=Recupero%20password%20gestionale"
                    className="text-xs text-[#0A263A] hover:underline"
                  >
                    Password dimenticata?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-gray-200 bg-white text-[#0F172A] focus:border-[#0A263A] focus:ring-2 focus:ring-[#0A263A]/10 outline-none transition-colors text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 text-sm px-3.5 py-2.5 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0A263A] hover:bg-[#0F2F46] text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Accesso in corso…
                  </>
                ) : (
                  'Accedi'
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#0A263A]/5 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-[#0A263A]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#0F172A]">Verifica a due fattori</h2>
                  <p className="text-xs text-gray-500">Codice a 6 cifre dall&apos;app Authenticator</p>
                </div>
              </div>

              <div className="flex justify-center gap-2">
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
                    className="w-11 h-12 text-center text-lg font-semibold rounded-lg border border-gray-200 bg-white text-[#0F172A] focus:border-[#0A263A] focus:ring-2 focus:ring-[#0A263A]/10 outline-none transition-colors"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {error && (
                <div role="alert" aria-live="assertive" className="bg-red-50 border border-red-200 text-red-700 text-sm px-3.5 py-2.5 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleVerify2FA}
                disabled={verifying2FA || totpCode.some(d => d === '')}
                className="w-full bg-[#0A263A] hover:bg-[#0F2F46] text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {verifying2FA ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verifica in corso…
                  </>
                ) : (
                  'Verifica codice'
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
                className="w-full text-xs text-gray-500 hover:text-[#0A263A] transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft size={12} />
                Torna al login
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          PiraWeb Gestionale &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
