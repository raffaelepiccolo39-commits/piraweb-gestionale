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
} from 'recharts';

interface ChartDatum {
  name: string;
  Assegnati: number;
  Completati: number;
}

export default function ProductivityTrendChart({ data }: { data: ChartDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 237, 230, 0.08)" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" />
        <YAxis tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1a1a1a',
            border: '1px solid rgba(240, 237, 230, 0.12)',
            borderRadius: '12px',
            fontSize: '13px',
            color: '#f0ede6',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '13px' }} />
        <Bar dataKey="Assegnati" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Completati" fill="#4f46e5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
