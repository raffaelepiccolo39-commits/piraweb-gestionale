'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

interface ForecastCardProps {
  monthlyRevenue: number;
  monthlySalaryCost: number;
  activeContracts: number;
}

export function ForecastCard({ monthlyRevenue, monthlySalaryCost, activeContracts }: ForecastCardProps) {
  const months = [1, 2, 3];
  const projectedRevenue = monthlyRevenue * 3;
  const projectedCosts = monthlySalaryCost * 3;
  const projectedMargin = projectedRevenue - projectedCosts;
  const isPositive = projectedMargin >= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target size={18} className="text-pw-accent" />
          <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
            Previsione prossimi 3 mesi
          </h2>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {months.map((m) => {
            const rev = monthlyRevenue * m;
            const cost = monthlySalaryCost * m;
            const margin = rev - cost;
            const date = new Date();
            date.setMonth(date.getMonth() + m);
            const label = date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });

            return (
              <div key={m} className="p-3 rounded-xl bg-pw-surface-2">
                <p className="text-[10px] text-pw-text-dim uppercase tracking-wider mb-2">{label}</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-pw-text-muted">Entrate</span>
                    <span className="text-green-400 font-medium animate-count">{formatCurrency(rev)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pw-text-muted">Costi</span>
                    <span className="text-red-400 font-medium animate-count">{formatCurrency(cost)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-pw-border">
                    <span className="text-pw-text font-medium">Margine</span>
                    <span className={`font-bold animate-count ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(margin)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className={`p-4 rounded-xl border ${isPositive ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="flex items-center gap-3">
            {isPositive ? (
              <TrendingUp size={24} className="text-green-400" />
            ) : (
              <TrendingDown size={24} className="text-red-400" />
            )}
            <div>
              <p className={`text-lg font-bold animate-count ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(projectedMargin)} margine previsto
              </p>
              <p className="text-xs text-pw-text-muted">
                Basato su {activeContracts} contratti attivi · Entrate {formatCurrency(projectedRevenue)} — Costi {formatCurrency(projectedCosts)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
