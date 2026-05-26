'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface CashflowDatum {
  name: string;
  Entrate: number;
  'Da incassare': number;
  Uscite: number;
  Margine: number;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#1a1a1a',
  border: '1px solid rgba(240, 237, 230, 0.12)',
  borderRadius: '12px',
  fontSize: '13px',
  color: '#f0ede6',
};

const fmtTick = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`);

export function CashflowEntrateUscite({ data }: { data: CashflowDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 237, 230, 0.08)" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" />
        <YAxis tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" tickFormatter={fmtTick} />
        <Tooltip formatter={(value) => [formatCurrency(Number(value)), undefined]} contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: '13px' }} />
        <Bar dataKey="Entrate" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Da incassare" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Uscite" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashflowMargine({ data }: { data: CashflowDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 237, 230, 0.08)" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" />
        <YAxis tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" tickFormatter={fmtTick} />
        <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Margine']} contentStyle={TOOLTIP_STYLE} />
        <Line type="monotone" dataKey="Margine" stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: '#6366f1' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
