'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Euro } from 'lucide-react';

interface CashflowSnapshotProps {
  expected: number;
  received: number;
  pending: number;
}

export const CashflowSnapshot = memo(function CashflowSnapshot({ expected, received, pending }: CashflowSnapshotProps) {
  const pct = expected > 0 ? Math.round((received / expected) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Euro size={16} className="text-yellow-500" />
          <span className="text-sm font-semibold text-pw-text">Cashflow Mensile</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-pw-text-dim uppercase tracking-wider">Incassato</p>
            <p className="text-lg font-bold text-green-400">{formatCurrency(received)}</p>
          </div>
          <div>
            <p className="text-[10px] text-pw-text-dim uppercase tracking-wider">Da incassare</p>
            <p className="text-lg font-bold text-yellow-400">{formatCurrency(pending)}</p>
          </div>
        </div>
        <div className="mt-3 h-2 bg-pw-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <Link href="/cashflow" className="text-xs text-pw-accent hover:underline mt-2 inline-block">
          Vedi dettagli →
        </Link>
      </CardContent>
    </Card>
  );
});
