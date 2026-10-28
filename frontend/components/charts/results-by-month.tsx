'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, chartAxisProps } from './common';

export type MonthCount = { month: string; count: number };

/** Results (or any event) per month — trend line for the KPI overview. */
export default function ResultsByMonthChart({
  data,
  seriesName = 'Results',
}: {
  data: MonthCount[];
  seriesName?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="month" {...chartAxisProps} />
        <YAxis allowDecimals={false} {...chartAxisProps} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
          formatter={(value) => [String(value), seriesName]}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
