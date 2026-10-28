'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartAxisProps } from './common';

export type RiskFactor = { name: string; value: number };

/** Top model factors (contribution %) — horizontal bars for the risk card. */
export default function RiskFactorsChart({ data }: { data: RiskFactor[] }) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
        <XAxis type="number" {...chartAxisProps} unit="%" />
        <YAxis type="category" dataKey="name" {...chartAxisProps} width={130} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
          formatter={(value) => [`${String(value)}%`, 'Contribution']}
        />
        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
