'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface PeriodComparisonProps {
  currentRevenue: number;
  previousRevenue: number;
  currentMargin: number;
  previousMargin: number;
  currentReceived: number;
  previousReceived: number;
  currentClients: number;
  previousClients: number;
  periodLabel: string;
}

function getChange(current: number, previous: number): { pct: number; direction: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' };
  const pct = ((current - previous) / previous) * 100;
  return { pct, direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

export function PeriodComparison({
  currentRevenue, previousRevenue,
  currentMargin, previousMargin,
  currentReceived, previousReceived,
  currentClients, previousClients,
  periodLabel,
}: PeriodComparisonProps) {
  const metrics = [
    {
      label: 'Entrate attese',
      current: currentRevenue,
      previous: previousRevenue,
      format: formatCurrency,
    },
    {
      label: 'Incassato',
      current: currentReceived,
      previous: previousReceived,
      format: formatCurrency,
    },
    {
      label: 'Margine netto',
      current: currentMargin,
      previous: previousMargin,
      format: formatCurrency,
    },
    {
      label: 'Clienti attivi',
      current: currentClients,
      previous: previousClients,
      format: (v: number) => String(v),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
          Confronto con {periodLabel}
        </h2>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m) => {
            const change = getChange(m.current, m.previous);
            const Icon = change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus;
            const colorClass = change.direction === 'up' ? 'text-green-400' : change.direction === 'down' ? 'text-red-400' : 'text-pw-text-dim';

            return (
              <div key={m.label} className="p-3 rounded-xl bg-pw-surface-2">
                <p className="text-[10px] text-pw-text-dim uppercase tracking-wider">{m.label}</p>
                <p className="text-lg font-bold text-pw-text mt-1 animate-count">{m.format(m.current)}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Icon size={14} className={colorClass} />
                  <span className={`text-xs font-medium ${colorClass}`}>
                    {change.direction === 'flat' ? '0%' : `${change.pct > 0 ? '+' : ''}${change.pct.toFixed(1)}%`}
                  </span>
                  <span className="text-[10px] text-pw-text-dim">
                    vs {m.format(m.previous)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
