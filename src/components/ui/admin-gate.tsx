'use client';

import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Lock, Loader2, AlertTriangle } from 'lucide-react';

interface AdminGateProps {
  children: React.ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  const [verified, setVerified] = useState(false);
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setPin(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = pin.join('');
    if (code.length !== 6) {
      setError('Inserisci il codice completo');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });

      const data = await res.json();

      if (data.valid) {
        setVerified(true);
      } else {
        setError('Codice errato. Riprova.');
        setPin(['', '', '', '', '', '']);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Errore di connessione');
    }

    setVerifying(false);
  };

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (pin.every(d => d !== '') && !verifying && !verified) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (verified) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-fade-scale">
      <div className="w-full max-w-sm mx-auto text-center px-4">
        {/* Shield icon */}
        <div className="w-16 h-16 rounded-2xl bg-pw-accent/10 flex items-center justify-center mx-auto mb-6">
          <ShieldCheck size={32} className="text-pw-accent" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-pw-text font-[var(--font-syne)] mb-1">
          Area Riservata
        </h2>
        <p className="text-sm text-pw-text-muted mb-8">
          Inserisci il codice di sicurezza per accedere ai dati finanziari
        </p>

        {/* PIN input */}
        <div
          className={`flex justify-center gap-3 mb-6 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
          onPaste={handlePaste}
        >
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-pw-surface-2 text-pw-text outline-none transition-all duration-200 ease-out
                ${digit ? 'border-pw-accent/40' : 'border-pw-border'}
                ${error ? 'border-red-500/50' : ''}
                focus:border-pw-accent focus:ring-2 focus:ring-pw-accent/20
              `}
              autoComplete="off"
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center justify-center gap-2 text-red-400 text-sm mb-4 animate-slide-up">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Loading indicator */}
        {verifying && (
          <div className="flex items-center justify-center gap-2 text-pw-text-muted text-sm">
            <Loader2 size={16} className="animate-spin" />
            <span>Verifica in corso...</span>
          </div>
        )}

        {/* Security note */}
        <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-pw-text-dim uppercase tracking-wider">
          <Lock size={10} />
          <span>Protetto con crittografia SHA-256</span>
        </div>
      </div>
    </div>
  );
}
