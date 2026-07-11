'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getInitials, todayLocal } from '@/lib/utils';
import { CalendarClock, Loader2, Check } from 'lucide-react';

interface Row {
  client_id: string;
  name: string;
  covered_until: string | null;
}

/**
 * Widget home: scadenze dei piani editoriali di tutti i clienti.
 * Bernis (social) e admin possono compilare/aggiornare la data "programmato
 * fino a" per ogni cliente, che alimenta l'avviso automatico di shooting.
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
        .is('paused_at', null)
        .order('company'),
      supabase.from('client_ped_coverage').select('client_id, covered_until'),
    ]);
    const covMap = new Map<string, string | null>();
    for (const c of (covRes.data as { client_id: string; covered_until: string | null }[]) ?? []) {
      covMap.set(c.client_id, c.covered_until);
    }
    const list: Row[] = ((clientsRes.data as { id: string; name: string; company: string | null }[]) ?? []).map((c) => ({
      client_id: c.id,
      name: c.company || c.name,
      covered_until: covMap.get(c.id) ?? null,
    }));
    // Mancanti in cima (da compilare), poi per scadenza più vicina.
    list.sort((a, b) => {
      if (!a.covered_until && !b.covered_until) return a.name.localeCompare(b.name);
      if (!a.covered_until) return -1;
      if (!b.covered_until) return 1;
      return a.covered_until.localeCompare(b.covered_until);
    });
    setRows(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = async (clientId: string, date: string) => {
    setRows((prev) => prev.map((r) => (r.client_id === clientId ? { ...r, covered_until: date || null } : r)));
    if (!date) return;
    setSavingId(clientId);
    const { error } = await supabase.rpc('set_ped_coverage', { p_client_id: clientId, p_covered_until: date });
    setSavingId(null);
    if (error) { toast.error(error.message || 'Salvataggio non riuscito'); return; }
    setSavedId(clientId);
    setTimeout(() => setSavedId((s) => (s === clientId ? null : s)), 1500);
  };

  const today = todayLocal();
  const soon = (d: string | null) => {
    if (!d) return false;
    const t = new Date(today); t.setDate(t.getDate() + 14);
    return d <= `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-pw-text flex items-center gap-2">
          <CalendarClock size={18} className="text-pink-400" />
          Scadenze piani editoriali
        </h2>
        <p className="text-xs text-pw-text-muted mt-0.5">
          Fino a quando è programmato il piano editoriale di ogni cliente. Serve ad avvisare per tempo di programmare lo shooting.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-pw-text-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-pw-text-dim">Nessun cliente attivo.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-pw-border">
            {rows.map((r) => (
              <div key={r.client_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-7 h-7 rounded-lg bg-pw-surface-2 flex items-center justify-center text-[10px] font-semibold text-pw-text-muted shrink-0">
                  {getInitials(r.name)}
                </span>
                <span className="text-sm text-pw-text flex-1 truncate">{r.name}</span>
                {!r.covered_until ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                    da impostare
                  </span>
                ) : soon(r.covered_until) ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 font-medium shrink-0">
                    in scadenza
                  </span>
                ) : null}
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
