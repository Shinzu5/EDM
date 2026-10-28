'use client';

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from './common';

/** Overall DQ score gauge (0–100) for the governance quality scorecard. */
export default function QualityGauge({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const data = [{ name: 'DQ score', value: safeScore }];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={10} fill={CHART_COLORS[0]} background={{ fill: '#eef2f7' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-3xl font-semibold tabular-nums text-slate-900">{safeScore}</span>
        <span className="text-[11px] uppercase tracking-wide text-slate-500">out of 100</span>
      </div>
    </div>
  );
}
