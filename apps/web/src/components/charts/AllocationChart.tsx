'use client';

import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ChartPoint } from '@/lib/demo-data';

const colors = ['#ff334f', '#f15b47', '#36d9f5', '#276dff', '#697480'] as const;
export function AllocationChart({ data }: { readonly data: readonly ChartPoint[] }) {
  const chartData = data.map((item, index) => ({ ...item, fill: colors[index % colors.length] ?? colors[0] }));
  return <div className="glass h-80 rounded-2xl p-5"><p className="eyebrow">ASSET ALLOCATION</p><div className="flex h-[88%] items-center"><ResponsiveContainer width="58%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="82%" paddingAngle={3} /><Tooltip contentStyle={{ background: '#0b0d10', border: '1px solid #222831', borderRadius: 12, fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="grid flex-1 gap-3">{data.map((item, index) => <div key={item.label} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-white/55"><i className="size-1.5 rounded-full" style={{ background: colors[index % colors.length] ?? colors[0] }} />{item.label}</span><b>{item.value}%</b></div>)}</div></div></div>;
}
