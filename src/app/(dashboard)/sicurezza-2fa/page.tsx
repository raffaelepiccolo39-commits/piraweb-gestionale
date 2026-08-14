'use client';

/**
 * Attivazione della 2FA NATIVA di Supabase (fattore TOTP → sessione AAL2).
 *
 * Volutamente SEPARATA dal sistema 2FA custom (user_totp + cookie), che resta
 * in piedi: qui si attiva il fattore nativo in parallelo, si prova, e solo dopo
 * — in un secondo momento — si dismette il custom e si impone AAL2 via RLS.
 * Nessun passo di questa pagina può bloccare l'accesso.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { reportUnknown } from '@/lib/report-error';
import { ShieldCheck, Smartphone, Check, Trash2, RefreshCw } from 'lucide-react';

interface FattoreTotp { id: string; status: 'verified' | 'unverified'; friendly_name?: string | null }

export default function Sicurezza2FA() {
  const supabase = createClient();
  const toast = useToast();

  const [fattori, setFattori] = useState<FattoreTotp[]>([]);
  const [aal, setAal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { reportUnknown(error, 'client', { stage: '2fa-list' }); }
    setFattori((data?.totp ?? []) as FattoreTotp[]);
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal(aalData?.currentLevel ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  const verificato = fattori.find((f) => f.status === 'verified');
  const inSospeso = fattori.find((f) => f.status === 'unverified');

  const avviaAttivazione = async () => {
    setBusy(true);
    try {
      // Rimuove eventuali tentativi lasciati a metà, per non accumulare fattori.
      if (inSospeso) await supabase.auth.mfa.unenroll({ factorId: inSospeso.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'App autenticazione' });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } catch (e) {
      const msg = (e as { message?: string })?.message || '';
      if (/not enabled|disabled/i.test(msg)) {
        toast.error('La 2FA nativa non è ancora abilitata su Supabase: attivala dal pannello (Authentication → MFA).');
      } else {
        reportUnknown(e, 'client', { stage: '2fa-enroll' });
        toast.error(msg || 'Errore attivazione');
      }
    } finally { setBusy(false); }
  };

  const verifica = async () => {
    if (!enroll || code.length !== 6) return toast.error('Inserisci il codice a 6 cifre');
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code });
      if (vErr) throw vErr;
      toast.success('2FA nativa attivata e verificata');
      setEnroll(null); setCode('');
      carica();
    } catch (e) {
      reportUnknown(e, 'client', { stage: '2fa-verify' });
      toast.error((e as { message?: string })?.message || 'Codice non valido');
    } finally { setBusy(false); }
  };

  const rimuovi = async (factorId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success('Fattore rimosso');
      carica();
    } catch (e) { reportUnknown(e, 'client', { stage: '2fa-unenroll' }); toast.error('Errore rimozione'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 animate-slide-up">
      <PageHeader eyebrow="Sicurezza" title="Verifica in due passaggi (nativa)"
        subtitle="Attivazione del secondo fattore gestito da Supabase. Convive con la 2FA attuale finché non completiamo il passaggio: attivarla qui non tocca il tuo accesso." />

      {loading ? <p className="text-sm text-pw-text-muted">Caricamento…</p> : (
        <>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${verificato ? 'bg-green-500/15 text-green-500' : 'bg-pw-surface-2 text-pw-text-muted'}`}>
                <ShieldCheck size={20} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-pw-text">{verificato ? '2FA nativa attiva' : '2FA nativa non attiva'}</p>
                <p className="text-xs text-pw-text-muted">Livello sessione corrente: <span className="font-mono">{aal ?? '—'}</span>{aal === 'aal2' && ' (secondo fattore superato)'}</p>
              </div>
              {verificato && <Button variant="outline" size="sm" onClick={() => rimuovi(verificato.id)} loading={busy}><Trash2 size={14} /> Rimuovi</Button>}
            </div>
          </CardContent></Card>

          {!verificato && !enroll && (
            <Button onClick={avviaAttivazione} loading={busy}><Smartphone size={16} /> Attiva la 2FA nativa</Button>
          )}

          {enroll && (
            <Card><CardContent className="space-y-4 p-5">
              <p className="text-sm text-pw-text">1. Scansiona questo QR con l&apos;app di autenticazione (Google Authenticator, Authy…):</p>
              <div className="mx-auto w-fit rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: enroll.qr }} />
              <p className="text-xs text-pw-text-muted">Oppure inserisci manualmente il codice: <span className="font-mono break-all">{enroll.secret}</span></p>
              <div className="h-px bg-pw-border" />
              <p className="text-sm text-pw-text">2. Inserisci il codice a 6 cifre che compare nell&apos;app:</p>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" inputMode="numeric" className="text-center text-lg tracking-[0.3em]" />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setEnroll(null); if (inSospeso) rimuovi(inSospeso.id); }} className="flex-1">Annulla</Button>
                <Button onClick={verifica} loading={busy} className="flex-1"><Check size={15} /> Verifica e attiva</Button>
              </div>
            </CardContent></Card>
          )}

          {inSospeso && !enroll && (
            <p className="flex items-center gap-2 text-xs text-pw-text-dim">
              <RefreshCw size={13} /> C&apos;è un&apos;attivazione lasciata a metà.
              <button onClick={avviaAttivazione} className="text-pw-accent hover:underline">Ricomincia</button>
              {' o '}
              <button onClick={() => rimuovi(inSospeso.id)} className="text-pw-accent hover:underline">rimuovila</button>.
            </p>
          )}

          <p className="text-xs text-pw-text-dim">
            Passo 1 del passaggio alla 2FA nativa. Quando l&apos;avrai attivata e verificata qui, il prossimo passo è provare il login, poi imporre il secondo fattore anche a livello dati.
          </p>
        </>
      )}
    </div>
  );
}
