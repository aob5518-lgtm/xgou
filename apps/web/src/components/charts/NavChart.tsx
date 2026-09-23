'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartPoint } from '@/lib/demo-data';

export function NavChart({ data, color = 'var(--cyan)', title = 'NAV HISTORY' }: { readonly data: readonly ChartPoint[]; readonly color?: string; readonly title?: string }) {
  return <div className="glass h-80 rounded-2xl p-5"><p className="eyebrow mb-5">{title}</p><ResponsiveContainer width="100%" height="85%"><AreaChart data={[...data]}><defs><linearGradient id={`nav-${title.replaceAll(' ', '-')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={.35} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#65707d', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide domain={['dataMin - 100', 'dataMax + 100']} /><Tooltip contentStyle={{ background: '#0b0d10', border: '1px solid #222831', borderRadius: 12, fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke={color} fill={`url(#nav-${title.replaceAll(' ', '-')})`} strokeWidth={2} /></AreaChart></ResponsiveContainer></div>;
}
