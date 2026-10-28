'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, chartAxisProps } from './common';

export type MetricComparison = { metric: string; before: number; after: number };

/** Before/after grouped bars — the outcomes page's "measure success" chart. */
export default function OutcomesBarChart({ data }: { data: MetricComparison[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="metric" {...chartAxisProps} />
        <YAxis {...chartAxisProps} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
          cursor={{ fill: '#f1f5f9' }}
          formatter={(value) => [String(value), '']}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="before" name="Before" fill={CHART_COLORS[3]} radius={[3, 3, 0, 0]} />
        <Bar dataKey="after" name="After" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
