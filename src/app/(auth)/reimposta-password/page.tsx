'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * Nuova password, dopo aver seguito il link di recupero.
 *
 * Ci si arriva già con una sessione aperta da /api/auth/confirm, quindi non
 * serve chiedere di nuovo chi sei. Se il link è scaduto la sessione non
 * c'è e la route risponde dicendolo, invece di lasciare un errore muto.
 *
 * Dopo il salvataggio si va a /dashboard: chi è del team ci entra, un
 * cliente del portale viene rimandato alla sua area dalle guardie di
 * navigazione. Non serve saperlo qui.
 */
export default function ReimpostaPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [mostra, setMostra] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState('');
  const [scaduto, setScaduto] = useState(false);

  const salva = async () => {
    if (password.length < 8) { setErrore('La password deve avere almeno 8 caratteri'); return; }
    if (password !== conferma) { setErrore('Le due password non coincidono'); return; }
    setErrore('');
    setInvio(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 401) { setScaduto(true); return; }
      if (!res.ok) { setErrore(body.error || 'Non è stato possibile salvare'); return; }

      router.replace('/dashboard');
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F4] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        {scaduto ? (
          <div className="text-center">
            <h1 className="text-xl font-bold text-[#0A263A] mb-2">Link scaduto</h1>
            <p className="text-sm text-gray-600 mb-6">
              Questo link non è più valido: vale un&apos;ora e si può usare una volta sola.
              Richiedine uno nuovo.
            </p>
            <Link
              href="/password-dimenticata"
              className="inline-block px-4 py-2.5 rounded-lg bg-[#0A263A] text-white text-sm font-semibold"
            >
              Richiedi un nuovo link
            </Link>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0A263A]/5 flex items-center justify-center mb-4">
              <KeyRound size={24} className="text-[#0A263A]" />
            </div>
            <h1 className="text-xl font-bold text-[#0A263A] text-center mb-2">Scegli una nuova password</h1>
            <p className="text-sm text-gray-600 text-center mb-6">Almeno 8 caratteri.</p>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type={mostra ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nuova password"
                  autoFocus
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-gray-200 bg-white text-[#0F172A] focus:border-[#0A263A] focus:ring-2 focus:ring-[#0A263A]/10 outline-none transition-colors text-sm"
                />
                <button
                  type="button"
                  onClick={() => setMostra(!mostra)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  aria-label={mostra ? 'Nascondi password' : 'Mostra password'}
                >
                  {mostra ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <input
                type={mostra ? 'text' : 'password'}
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') salva(); }}
                placeholder="Ripeti la password"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-[#0F172A] focus:border-[#0A263A] focus:ring-2 focus:ring-[#0A263A]/10 outline-none transition-colors text-sm"
              />

              {errore && <p className="text-xs text-red-600">{errore}</p>}

              <button
                onClick={salva}
                disabled={invio}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0A263A] text-white text-sm font-semibold disabled:opacity-60"
              >
                {invio ? <><Loader2 size={16} className="animate-spin" /> Salvo…</> : 'Salva ed entra'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
