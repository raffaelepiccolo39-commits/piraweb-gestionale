'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SkeletonList } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import type { ErrorLogGroup, ErrorSource } from '@/types/database';
import {
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCw,
  ShieldCheck,
  Users,
} from 'lucide-react';

/**
 * Log errori — solo admin.
 *
 * Mostra i PROBLEMI, non le occorrenze: la vista error_log_groups raggruppa
 * per fingerprint, così un errore capitato 47 volte è una riga sola con
 * scritto 47, non 47 righe da scorrere.
 */

const SOURCE_LABELS: Record<ErrorSource, string> = {
  client: 'Browser',
  boundary: 'Crash pagina',
  api: 'API',
  server: 'Server',
  cron: 'Cron',
};

const SOURCE_TONES: Record<ErrorSource, 'danger' | 'warning' | 'info' | 'neutral' | 'accent'> = {
  client: 'info',
  boundary: 'danger',
  api: 'warning',
  server: 'accent',
  cron: 'neutral',
};

/** Da quanto tempo, in italiano leggibile. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 1) return 'adesso';
  if (mins < 60) return `${mins} min fa`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`;

  return formatDate(iso);
}

export default function LogPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [groups, setGroups] = useState<ErrorLogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');

  const isAdmin = profile?.role === 'admin';

  const fetchGroups = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    setLoadError(null);

    let query = supabase
      .from('error_log_groups')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(200);

    if (sourceFilter) query = query.eq('source', sourceFilter);
    if (statusFilter === 'open') query = query.eq('resolved', false);
    if (statusFilter === 'resolved') query = query.eq('resolved', true);

    const { data, error } = await query;

    if (error) {
      // Ironia: se il log degli errori fallisce, lo diciamo e basta —
      // non lo mandiamo a se stesso.
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setGroups((data ?? []) as ErrorLogGroup[]);
    setLoading(false);
  }, [supabase, isAdmin, sourceFilter, statusFilter]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  async function toggleResolved(group: ErrorLogGroup) {
    setResolving(group.fingerprint);

    const nowResolved = !group.resolved;

    const { error } = await supabase
      .from('error_logs')
      .update({
        resolved_at: nowResolved ? new Date().toISOString() : null,
        resolved_by: nowResolved ? (profile?.id ?? null) : null,
      })
      .eq('fingerprint', group.fingerprint);

    setResolving(null);

    if (error) {
      toast.error('Non sono riuscito ad aggiornare lo stato');
      return;
    }

    toast.success(nowResolved ? 'Segnato come risolto' : 'Riaperto');
    void fetchGroups();
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Area riservata"
        description="Il log degli errori è visibile solo agli amministratori."
      />
    );
  }

  const openCount = groups.filter((g) => !g.resolved).length;
  const totalOccurrences = groups.reduce((sum, g) => sum + Number(g.occurrences), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Log errori"
        subtitle={
          loading
            ? 'Carico…'
            : `${openCount} ${openCount === 1 ? 'problema aperto' : 'problemi aperti'} · ${totalOccurrences} occorrenze totali`
        }
        actions={
          <Button variant="secondary" onClick={() => void fetchGroups()} disabled={loading}>
            <RotateCw className="h-4 w-4" />
            Aggiorna
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'open', label: 'Da risolvere' },
            { value: 'resolved', label: 'Risolti' },
            { value: '', label: 'Tutti' },
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          placeholder="Tutte le origini"
          options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      {loadError && (
        <Card className="mb-5 border-pw-danger/30">
          <CardContent>
            <p className="text-sm text-pw-danger">
              Non riesco a leggere i log: {loadError}
            </p>
            <p className="mt-1 text-xs text-pw-text-dim">
              Se la tabella non esiste ancora, esegui la migration
              <span className="font-mono"> 20260714_error_logs.sql</span>.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <SkeletonList />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={statusFilter === 'open' ? 'Nessun problema aperto' : 'Nessun errore'}
          description={
            statusFilter === 'open'
              ? 'Il gestionale non ha registrato errori non risolti. Se hai appena attivato il log, dai tempo al sistema di raccoglierne.'
              : 'Non c’è nulla da mostrare con questi filtri.'
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isOpen = expanded === group.fingerprint;

            return (
              <Card key={group.fingerprint}>
                <CardContent className="p-0">
                  <button
                    onClick={() => setExpanded(isOpen ? null : group.fingerprint)}
                    className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-pw-card-hover-bg"
                    aria-expanded={isOpen}
                  >
                    <div className="mt-0.5 shrink-0 text-pw-text-dim">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={SOURCE_TONES[group.source]} size="sm">
                          {SOURCE_LABELS[group.source]}
                        </Badge>

                        {group.route && (
                          <span className="font-mono text-xs text-pw-text-dim">
                            {group.route}
                          </span>
                        )}

                        {group.resolved && (
                          <Badge tone="success" size="sm">
                            Risolto
                          </Badge>
                        )}
                      </div>

                      <p className="break-words text-sm font-medium text-pw-text">
                        {group.message}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-pw-text-dim">
                        <span className="font-semibold text-pw-text-muted">
                          {group.occurrences}×
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {group.users_affected}{' '}
                          {Number(group.users_affected) === 1 ? 'utente' : 'utenti'}
                        </span>
                        <span>ultima: {timeAgo(group.last_seen)}</span>
                        <span>prima: {timeAgo(group.first_seen)}</span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-pw-border px-4 pb-4 pt-4">
                      {group.stack && (
                        <pre className="mb-4 max-h-72 overflow-auto rounded-xl bg-pw-bg p-3 font-mono text-[11px] leading-relaxed text-pw-text-muted">
                          {group.stack}
                        </pre>
                      )}

                      {group.context && Object.keys(group.context).length > 0 && (
                        <div className="mb-4">
                          <p className="mb-1.5 text-xs font-semibold text-pw-text-muted">
                            Contesto
                          </p>
                          <pre className="max-h-48 overflow-auto rounded-xl bg-pw-bg p-3 font-mono text-[11px] text-pw-text-muted">
                            {JSON.stringify(group.context, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-pw-text-dim">
                          {group.last_user_email && (
                            <span>Ultimo utente colpito: {group.last_user_email}</span>
                          )}
                          {group.build_id && (
                            <span className="ml-3 font-mono">
                              build {group.build_id.slice(0, 7)}
                            </span>
                          )}
                        </div>

                        <Button
                          variant={group.resolved ? 'secondary' : 'primary'}
                          onClick={() => void toggleResolved(group)}
                          disabled={resolving === group.fingerprint}
                        >
                          {group.resolved ? (
                            <>
                              <AlertOctagon className="h-4 w-4" />
                              Riapri
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Segna risolto
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
