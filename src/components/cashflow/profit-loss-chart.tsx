'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface ProfitLossData {
  month: string;
  entrate: number;
  costi: number;
  margine: number;
}

interface ProfitLossChartProps {
  data: ProfitLossData[];
}

export function ProfitLossChart({ data }: ProfitLossChartProps) {
  if (data.length === 0) return null;

  const hasLoss = data.some((d) => d.margine < 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
            Andamento Profitto / Perdite
          </h2>
          {hasLoss && (
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg">
              Periodi in perdita rilevati
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorEntrate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCosti" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMargine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFD108" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#FFD108" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,237,230,0.08)" />
            <XAxis
              dataKey="month"
              stroke="rgba(240,237,230,0.3)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke="rgba(240,237,230,0.3)"
              fontSize={12}
              tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), undefined]}
              contentStyle={{
                backgroundColor: '#1a1a1a',
                border: '1px solid rgba(240,237,230,0.12)',
                borderRadius: '12px',
                fontSize: '13px',
              }}
              labelStyle={{ color: '#f0ede6' }}
            />
            <ReferenceLine y={0} stroke="rgba(240,237,230,0.3)" strokeDasharray="4 4" label={{ value: 'Break-even', fill: 'rgba(240,237,230,0.4)', fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="entrate"
              name="Entrate"
              stroke="#10B981"
              fill="url(#colorEntrate)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="costi"
              name="Costi"
              stroke="#EF4444"
              fill="url(#colorCosti)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="margine"
              name="Margine"
              stroke="#FFD108"
              fill="url(#colorMargine)"
              strokeWidth={2.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
