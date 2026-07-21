'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

/**
 * Richiesta del link per reimpostare la password.
 *
 * La conferma è volutamente identica che l'indirizzo esista o no: dire
 * "utente non trovato" trasformerebbe questa pagina in uno strumento per
 * scoprire chi ha un account.
 */
export default function PasswordDimenticataPage() {
  const [email, setEmail] = useState('');
  const [invio, setInvio] = useState(false);
  const [inviata, setInviata] = useState(false);
  const [errore, setErrore] = useState('');

  const invia = async () => {
    if (!email.trim()) { setErrore('Scrivi il tuo indirizzo email'); return; }
    setErrore('');
    setInvio(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErrore(body.error || 'Riprova fra poco'); return; }
      setInviata(true);
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F4] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        {inviata ? (
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle2 size={26} className="text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-[#0A263A] mb-2">Controlla la posta</h1>
            <p className="text-sm text-gray-600 mb-6">
              Se <strong>{email.trim()}</strong> è registrato, ti abbiamo mandato il link per
              scegliere una nuova password. Vale un&apos;ora.
            </p>
            <Link href="/login" className="text-sm text-[#0A263A] hover:underline inline-flex items-center gap-1.5">
              <ArrowLeft size={14} /> Torna all&apos;accesso
            </Link>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0A263A]/5 flex items-center justify-center mb-4">
              <Mail size={24} className="text-[#0A263A]" />
            </div>
            <h1 className="text-xl font-bold text-[#0A263A] text-center mb-2">Password dimenticata</h1>
            <p className="text-sm text-gray-600 text-center mb-6">
              Scrivi il tuo indirizzo email: ti mandiamo un link per sceglierne una nuova.
            </p>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') invia(); }}
              placeholder="la-tua@email.it"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-[#0F172A] focus:border-[#0A263A] focus:ring-2 focus:ring-[#0A263A]/10 outline-none transition-colors text-sm"
            />

            {errore && <p className="text-xs text-red-600 mt-2">{errore}</p>}

            <button
              onClick={invia}
              disabled={invio}
              className="w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0A263A] text-white text-sm font-semibold disabled:opacity-60"
            >
              {invio ? <><Loader2 size={16} className="animate-spin" /> Invio…</> : 'Mandami il link'}
            </button>

            <div className="text-center mt-5">
              <Link href="/login" className="text-sm text-gray-500 hover:text-[#0A263A] inline-flex items-center gap-1.5">
                <ArrowLeft size={14} /> Torna all&apos;accesso
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
