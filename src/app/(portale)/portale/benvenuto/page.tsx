'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortal } from '@/components/portale/portal-gate';
import { useToast } from '@/components/ui/toast';
import { KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * Primo accesso: il cliente sceglie la sua password.
 *
 * Il link dell'invito apre una sessione ma scade. Finché la password non
 * viene scelta, quel link è l'unico modo di entrare — e dopo la scadenza il
 * cliente resta fuori senza rimedio. Questa schermata chiude il buco.
 */
export default function BenvenutoPage() {
  const { clientName, fullName } = usePortal();
  const router = useRouter();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [mostra, setMostra] = useState(false);
  const [invio, setInvio] = useState(false);

  const nome = fullName?.split(' ')[0] || '';

  const salva = async () => {
    if (password.length < 8) { toast.error('La password deve avere almeno 8 caratteri'); return; }
    if (password !== conferma) { toast.error('Le due password non coincidono'); return; }

    setInvio(true);
    try {
      const res = await fetch('/api/portal/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) { toast.error(body.error || 'Non è stato possibile salvare la password'); return; }

      toast.success('Password impostata: da ora entri quando vuoi');
      // replace, non push: tornando indietro non si rivede questa schermata
      router.replace('/portale');
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-8">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-5">
        <KeyRound size={26} className="text-pw-accent" />
      </div>

      <h1 className="text-xl font-bold text-pw-text text-center mb-2">
        {nome ? `Benvenuto, ${nome}` : 'Benvenuto'}
      </h1>
      <p className="text-sm text-pw-text-muted text-center mb-6">
        Scegli una password per il tuo spazio di {clientName}. Ti servirà per rientrare:
        il link che hai ricevuto via email funziona una volta sola.
      </p>

      <div className="space-y-3">
        <div className="relative">
          <input
            type={mostra ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nuova password"
            autoFocus
            className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
          />
          <button
            type="button"
            onClick={() => setMostra(!mostra)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-pw-text-dim"
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
          className="w-full px-3.5 py-2.5 rounded-xl bg-pw-surface border border-pw-border text-sm text-pw-text placeholder:text-pw-text-dim"
        />

        <p className="text-[11px] text-pw-text-dim">Almeno 8 caratteri.</p>

        <button
          onClick={salva}
          disabled={invio}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-semibold disabled:opacity-60"
        >
          {invio ? <><Loader2 size={16} className="animate-spin" /> Salvo…</> : 'Entra nel mio spazio'}
        </button>
      </div>
    </div>
  );
}
