'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import type { TimeOffRequest } from '@/types/database';
import { Plane, Check, X } from 'lucide-react';

interface TimeOffInboxProps {
  requests: TimeOffRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const fmtDays = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

function rangeLabel(r: { start_date: string; end_date: string; start_half: boolean; end_half: boolean }) {
  if (r.start_date === r.end_date) {
    return `${formatDate(r.start_date)}${r.start_half ? ' (½)' : ''}`;
  }
  return `${formatDate(r.start_date)}${r.start_half ? ' (½)' : ''} → ${formatDate(r.end_date)}${r.end_half ? ' (½)' : ''}`;
}

export function TimeOffInbox({ requests, onApprove, onReject }: TimeOffInboxProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
            <Plane size={16} className="text-pw-accent" />
            Ferie da approvare
            {requests.length > 0 && (
              <span className="text-[11px] text-pw-text-dim font-medium tabular-nums">{requests.length}</span>
            )}
          </h2>
          <Link href="/ferie" className="text-xs text-pw-accent hover:underline">Tutte</Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {requests.length === 0 ? (
          <p className="px-6 py-5 text-sm text-pw-text-muted text-center">Nessuna richiesta in attesa</p>
        ) : (
          <div className="divide-y divide-pw-border">
            {requests.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pw-text truncate">
                      {r.user?.full_name || 'Dipendente'}
                    </p>
                    <p className="text-xs text-pw-text-muted truncate">
                      {TIME_OFF_TYPE_LABELS[r.type]} · {rangeLabel(r)}
                    </p>
                  </div>
                  <span className="text-xs text-pw-text-dim shrink-0 tabular-nums">
                    {fmtDays(Number(r.total_days))} gg
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onApprove(r.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-green-500/15 text-green-500 text-xs font-medium hover:bg-green-500/25 transition-colors"
                  >
                    <Check size={12} /> Approva
                  </button>
                  <button
                    onClick={() => onReject(r.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors"
                  >
                    <X size={12} /> Rifiuta
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
