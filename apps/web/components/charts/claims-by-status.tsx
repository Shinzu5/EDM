'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, chartAxisProps } from './common';

export type StatusCount = { status: string; count: number };

/** Claims bucketed by lifecycle status — bar chart for the KPI overview. */
export default function ClaimsByStatusChart({ data }: { data: StatusCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="status" {...chartAxisProps} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} {...chartAxisProps} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
          cursor={{ fill: '#f1f5f9' }}
          formatter={(value) => [String(value), 'Claims']}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
