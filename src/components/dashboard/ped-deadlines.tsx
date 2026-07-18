'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getInitials } from '@/lib/utils';
import { CalendarClock, Loader2, Check } from 'lucide-react';
import { reportSupabaseError } from '@/lib/report-error';

interface Row {
  client_id: string;
  name: string;
  covered_until: string | null;
}

/**
 * Widget home: clienti a cui manca la copertura del piano editoriale.
 * Bernis (social) e admin impostano la data "programmato fino a": viene salvata
 * e il cliente sparisce dalla lista. L'avviso pre-scadenza per programmare lo
 * shooting arriva in automatico dal cron ped-monitor (14 giorni prima), quindi
 * qui restano solo i clienti ancora da impostare.
 */
export function PedDeadlines() {
  const supabase = createClient();
  const toast = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [clientsRes, covRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, company')
        .eq('is_active', true)
        .eq('needs_ped', true)
        .is('paused_at', null)
        .order('company'),
      supabase.from('client_ped_coverage').select('client_id, covered_until'),
    ]);
    const covMap = new Map<string, string | null>();
    for (const c of (covRes.data as { client_id: string; covered_until: string | null }[]) ?? []) {
      covMap.set(c.client_id, c.covered_until);
    }
    // Solo i clienti SENZA copertura impostata: quelli già programmati sono
    // "fatti" e non devono ingombrare la dashboard (ci pensa il cron ad avvisare
    // quando la scadenza si avvicina).
    const list: Row[] = ((clientsRes.data as { id: string; name: string; company: string | null }[]) ?? [])
      .filter((c) => !covMap.get(c.id))
      .map((c) => ({
        client_id: c.id,
        name: c.company || c.name,
        covered_until: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setRows(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = async (clientId: string, date: string) => {
    if (!date) return;
    // Mostra subito la data scelta mentre salva.
    setRows((prev) => prev.map((r) => (r.client_id === clientId ? { ...r, covered_until: date } : r)));
    setSavingId(clientId);
    const { error } = await supabase.rpc('set_ped_coverage', { p_client_id: clientId, p_covered_until: date });
    setSavingId(null);
    if (error) {
      reportSupabaseError(error, 'ped-salva-copertura', { clientId });
      toast.error(error.message || 'Salvataggio non riuscito');
      // Ripristina il campo vuoto così si può ritentare.
      setRows((prev) => prev.map((r) => (r.client_id === clientId ? { ...r, covered_until: null } : r)));
      return;
    }
    // Memorizzato: conferma verde, poi il cliente sparisce dalla lista.
    setSavedId(clientId);
    toast.success('Piano editoriale programmato');
    setTimeout(() => {
      setRows((prev) => prev.filter((r) => r.client_id !== clientId));
      setSavedId((s) => (s === clientId ? null : s));
    }, 900);
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-pw-text flex items-center gap-2">
          <CalendarClock size={18} className="text-pink-400" />
          Scadenze piani editoriali
        </h2>
        <p className="text-xs text-pw-text-muted mt-0.5">
          Clienti a cui manca la data di copertura. Impostala: viene salvata e il cliente sparisce dalla lista. L’avviso per lo shooting arriva in automatico prima della scadenza.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-pw-text-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-pw-text-dim">Tutti i piani editoriali sono programmati. 🎉</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-pw-border">
            {rows.map((r) => (
              <div key={r.client_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-7 h-7 rounded-lg bg-pw-surface-2 flex items-center justify-center text-[10px] font-semibold text-pw-text-muted shrink-0">
                  {getInitials(r.name)}
                </span>
                <span className="text-sm text-pw-text flex-1 truncate">{r.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="date"
                    value={r.covered_until ?? ''}
                    onChange={(e) => save(r.client_id, e.target.value)}
                    className="px-2 py-1 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text text-xs focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none"
                  />
                  {savingId === r.client_id ? (
                    <Loader2 size={14} className="animate-spin text-pw-text-dim" />
                  ) : savedId === r.client_id ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
