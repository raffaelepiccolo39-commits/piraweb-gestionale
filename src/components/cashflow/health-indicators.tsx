'use client';

import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Percent, Users, Briefcase } from 'lucide-react';

interface HealthIndicatorsProps {
  operatingMarginPct: number;
  collectionRate: number;
  topClientConcentration: number;
  laborCostRatio: number;
}

function getColor(value: number, thresholds: { green: number; yellow: number }, invert = false): string {
  if (invert) {
    if (value < thresholds.green) return 'text-green-400 bg-green-500/10 border-green-500/20';
    if (value < thresholds.yellow) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    return 'text-red-400 bg-red-500/10 border-red-500/20';
  }
  if (value >= thresholds.green) return 'text-green-400 bg-green-500/10 border-green-500/20';
  if (value >= thresholds.yellow) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-red-400 bg-red-500/10 border-red-500/20';
}

function getLabel(value: number, thresholds: { green: number; yellow: number }, invert = false): string {
  if (invert) {
    if (value < thresholds.green) return 'Ottimo';
    if (value < thresholds.yellow) return 'Attenzione';
    return 'Critico';
  }
  if (value >= thresholds.green) return 'Ottimo';
  if (value >= thresholds.yellow) return 'Attenzione';
  return 'Critico';
}

export function HealthIndicators({ operatingMarginPct, collectionRate, topClientConcentration, laborCostRatio }: HealthIndicatorsProps) {
  const indicators = [
    {
      label: 'Margine Operativo',
      value: `${operatingMarginPct.toFixed(1)}%`,
      icon: TrendingUp,
      color: getColor(operatingMarginPct, { green: 20, yellow: 10 }),
      status: getLabel(operatingMarginPct, { green: 20, yellow: 10 }),
    },
    {
      label: 'Tasso di Incasso',
      value: `${collectionRate.toFixed(1)}%`,
      icon: Percent,
      color: getColor(collectionRate, { green: 80, yellow: 60 }),
      status: getLabel(collectionRate, { green: 80, yellow: 60 }),
    },
    {
      label: 'Concentrazione Ricavi',
      value: `${topClientConcentration.toFixed(1)}%`,
      icon: Users,
      color: getColor(topClientConcentration, { green: 30, yellow: 50 }, true),
      status: getLabel(topClientConcentration, { green: 30, yellow: 50 }, true),
      description: 'dal top client',
    },
    {
      label: 'Costo Lavoro / Ricavi',
      value: `${laborCostRatio.toFixed(1)}%`,
      icon: Briefcase,
      color: getColor(laborCostRatio, { green: 50, yellow: 70 }, true),
      status: getLabel(laborCostRatio, { green: 50, yellow: 70 }, true),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {indicators.map((ind) => (
        <Card key={ind.label} className={`border ${ind.color.split(' ').pop()}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ind.color}`}>
                <ind.icon size={18} />
              </div>
              <span className={`text-[10px] uppercase tracking-wider font-bold ${ind.color.split(' ')[0]}`}>
                {ind.status}
              </span>
            </div>
            <p className={`text-2xl font-bold ${ind.color.split(' ')[0]}`}>{ind.value}</p>
            <p className="text-xs text-pw-text-muted mt-0.5">
              {ind.label}
              {ind.description && <span className="text-pw-text-dim"> · {ind.description}</span>}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
