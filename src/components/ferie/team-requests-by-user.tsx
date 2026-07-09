'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TIME_OFF_TYPE_LABELS, TIME_OFF_STATUS_LABELS } from '@/lib/constants';
import { STATUS_TONE, TYPE_ICON, fmtDays, dateRangeLabel } from '@/lib/time-off';
import type { TimeOffRequest, TimeOffStatus } from '@/types/database';
import { ChevronRight } from 'lucide-react';

/**
 * Storico richieste del team raggruppato per collaboratore: una sezione
 * richiudibile a testa, e dentro le richieste divise per stato.
 * La lista piatta diventava illeggibile appena il team accumulava richieste.
 */

/** Ordine di lettura: prima ciò che richiede un'azione, poi gli esiti. */
const STATUS_ORDER: TimeOffStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

interface TeamRequestsByUserProps {
  requests: TimeOffRequest[];
}

export function TeamRequestsByUser({ requests }: TeamRequestsByUserProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byUser = new Map<string, { name: string; color: string | null; requests: TimeOffRequest[] }>();

    for (const r of requests) {
      const id = r.user?.id ?? r.user_id;
      if (!byUser.has(id)) {
        byUser.set(id, { name: r.user?.full_name || 'Dipendente', color: r.user?.color ?? null, requests: [] });
      }
      byUser.get(id)!.requests.push(r);
    }

    return Array.from(byUser.entries())
      .map(([id, g]) => ({
        id,
        name: g.name,
        color: g.color,
        total: g.requests.length,
        // Richieste più recenti in cima dentro ogni stato
        byStatus: STATUS_ORDER.map((status) => ({
          status,
          items: g.requests
            .filter((r) => r.status === status)
            .sort((a, b) => b.start_date.localeCompare(a.start_date)),
        })).filter((s) => s.items.length > 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }, [requests]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isOpen = expanded.has(group.id);
        return (
          <Card key={group.id}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={isOpen}
              className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left rounded-2xl hover:bg-pw-surface-2 transition-colors duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-pw-accent/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ChevronRight
                  size={16}
                  className={`shrink-0 text-pw-text-dim transition-transform duration-200 ease-out ${isOpen ? 'rotate-90' : ''}`}
                />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: group.color || 'var(--pw-accent)' }}
                />
                <p className="text-sm font-medium text-pw-text truncate">{group.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {group.byStatus.map((s) => (
                  <Badge key={s.status} tone={STATUS_TONE[s.status]} size="sm">
                    {s.items.length} {TIME_OFF_STATUS_LABELS[s.status].toLowerCase()}
                  </Badge>
                ))}
              </div>
            </button>

            {isOpen && (
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                {group.byStatus.map((s) => (
                  <div key={s.status}>
                    <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-pw-text-dim mb-2">
                      {TIME_OFF_STATUS_LABELS[s.status]} ({s.items.length})
                    </p>
                    <div className="space-y-1.5">
                      {s.items.map((r) => {
                        const Icon = TYPE_ICON[r.type];
                        return (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-4 px-3 py-2 rounded-xl bg-pw-surface-2/60"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Icon size={14} className="shrink-0 text-pw-text-muted" />
                              <div className="min-w-0">
                                <p className="text-sm text-pw-text truncate">
                                  {TIME_OFF_TYPE_LABELS[r.type]} · {fmtDays(Number(r.total_days))} gg
                                </p>
                                <p className="text-xs text-pw-text-muted truncate">
                                  {dateRangeLabel(r)}
                                  {r.reason ? ` · ${r.reason}` : ''}
                                </p>
                                {r.status === 'rejected' && r.review_note && (
                                  <p className="text-xs text-pw-danger mt-0.5">Motivo rifiuto: {r.review_note}</p>
                                )}
                              </div>
                            </div>
                            <Badge tone={STATUS_TONE[r.status]} dot>
                              {TIME_OFF_STATUS_LABELS[r.status]}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
