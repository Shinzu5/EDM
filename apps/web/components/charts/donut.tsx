'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS } from './common';

export type Slice = { name: string; value: number };

/** Generic donut/pie — used for payer mix and encounter types. */
export default function DonutChart({
  data,
  innerRadius = 0,
  height = 260,
}: {
  data: Slice[];
  innerRadius?: number;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={innerRadius ? 70 : 80}
          paddingAngle={1}
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
          formatter={(value, name) => [String(value), String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
