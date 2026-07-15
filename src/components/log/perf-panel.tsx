'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonList } from '@/components/ui/skeleton';
import { Gauge } from 'lucide-react';
import type { PerfSummary } from '@/types/database';
import { reportSupabaseError } from '@/lib/report-error';

/**
 * Classifica di cosa ottimizzare, dagli ultimi 7 giorni.
 *
 * Ordinata per tempo TOTALE, non per la singola chiamata più lenta: una query
 * da 2s fatta una volta al giorno pesa meno di una da 400ms fatta 500 volte.
 * Quella che fa sembrare lento il gestionale è la seconda.
 */

function ms(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

/** Sopra il secondo l'utente se ne accorge; sopra i tre, se ne lamenta. */
function toneFor(p95: number): 'danger' | 'warning' | 'success' {
  if (p95 >= 3000) return 'danger';
  if (p95 >= 1000) return 'warning';
  return 'success';
}

export function PerfPanel() {
  const supabase = createClient();

  const [rows, setRows] = useState<PerfSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from('perf_summary')
      .select('*')
      .order('total_seconds', { ascending: false })
      .limit(60);

    if (error) {
      reportSupabaseError(error, 'perf-carica-metriche');
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as PerfSummary[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  if (loadError) {
    return (
      <Card className="border-pw-danger/30">
        <CardContent>
          <p className="text-sm text-pw-danger">Non riesco a leggere le metriche: {loadError}</p>
          <p className="mt-1 text-xs text-pw-text-dim">
            Se la tabella non esiste ancora, esegui la migration
            <span className="font-mono"> 20260714b_perf_logs.sql</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) return <SkeletonList />;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title="Ancora nessuna misura"
        description="Le durate si raccolgono mentre il team usa il gestionale. Torna tra qualche ora: servono un po' di sessioni reali prima che i numeri dicano qualcosa."
      />
    );
  }

  const worstOffender = rows[0];

  return (
    <div>
      <Card className="mb-4">
        <CardContent>
          <p className="text-sm text-pw-text">
            La cosa che ruba più tempo al team è{' '}
            <span className="font-mono font-semibold">{worstOffender.name}</span>:{' '}
            <span className="font-semibold">{worstOffender.total_seconds}s</span> di attesa
            complessiva in 7 giorni, su {worstOffender.samples} chiamate.
          </p>
          <p className="mt-1 text-xs text-pw-text-dim">
            Ordinato per tempo totale generato, non per la singola chiamata più lenta:
            è quello che si sente davvero usando la piattaforma.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pw-border text-left text-xs text-pw-text-dim">
                  <th className="px-4 py-3 font-medium">Chiamata</th>
                  <th className="px-4 py-3 font-medium">Pagina</th>
                  <th className="px-4 py-3 text-right font-medium">Chiamate</th>
                  <th className="px-4 py-3 text-right font-medium">Mediana</th>
                  <th className="px-4 py-3 text-right font-medium">p95</th>
                  <th className="px-4 py-3 text-right font-medium">Peggiore</th>
                  <th className="px-4 py-3 text-right font-medium">Totale</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.kind}|${row.name}|${row.route ?? ''}|${i}`}
                    className="border-b border-pw-border last:border-0 hover:bg-pw-card-hover-bg"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-pw-text">{row.name}</span>
                        {row.failures > 0 && (
                          <Badge tone="danger" size="sm">
                            {row.failures} ko
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-pw-text-dim">
                        {row.route ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-pw-text-muted">
                      {row.samples}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-pw-text-muted">
                      {ms(row.p50_ms)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={toneFor(row.p95_ms)} size="sm">
                        {ms(row.p95_ms)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-pw-text-dim">
                      {ms(row.max_ms)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-pw-text">
                      {row.total_seconds}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
