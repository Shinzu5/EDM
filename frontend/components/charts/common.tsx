import { Skeleton } from '@/components/ui/skeleton';

/** Loading placeholder sized for a chart panel. */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

export const CHART_COLORS = [
  '#2f7df6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
];

export const chartAxisProps = {
  tick: { fontSize: 11, fill: '#64748b' },
  axisLine: { stroke: '#e2e8f0' },
  tickLine: false as const,
};
