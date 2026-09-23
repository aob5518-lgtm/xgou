'use client';

import { useEffect, useState } from 'react';
import type { ActivityItem } from '@/lib/demo-data';

const updates: readonly Omit<ActivityItem, 'time'>[] = [
  { agent: 'Risk Agent', message: 'Exposure limits checked. No action required.', status: 'NORMAL' },
  { agent: 'Research Agent', message: 'Market breadth model refreshed.', status: 'SIGNAL LOGGED' },
  { agent: 'Spot Agent', message: 'Liquidity threshold verified for active assets.', status: 'MONITORING' },
  { agent: 'Futures Trend Agent', message: 'No trend entry passed the current risk gate.', status: 'NO ACTION' },
];

export function ActivityFeed({ initial }: { readonly initial: readonly ActivityItem[] }) {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      const update = updates[index % updates.length]; index += 1;
      if (!update) return;
      const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
      setItems((current) => [{ time: now, ...update }, ...current].slice(0, 12));
    }, 9000);
    return () => { window.clearInterval(timer); };
  }, []);
  return <div className="glass overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-[var(--border)] p-5"><p className="eyebrow">LIVE SYSTEM FEED · DEMO</p><span className="flex items-center gap-2 text-[9px] tracking-wider text-[var(--success)]"><i className="size-1.5 animate-pulse rounded-full bg-[var(--success)]" />STREAMING</span></div><div>{items.map((item, index) => <article key={`${item.time}-${item.agent}-${String(index)}`} className="grid gap-3 border-b border-white/[.04] p-5 sm:grid-cols-[90px_170px_1fr_auto] sm:items-center"><time className="font-mono text-xs text-white/30">{item.time}</time><strong className="text-sm font-normal">{item.agent}</strong><p className="text-sm text-white/55">{item.message}</p>{item.status && <span className="text-[9px] tracking-[.12em] text-[var(--cyan)]">{item.status}</span>}</article>)}</div></div>;
}
