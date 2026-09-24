'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ActivityItem } from '@/lib/demo-data';

const updates: readonly Omit<ActivityItem, 'time'>[] = [
  { agent: 'Risk Agent', message: '已完成敞口上限检查，无需执行操作。', status: 'NORMAL' },
  { agent: 'Research Agent', message: '市场广度模型已刷新。', status: 'SIGNAL LOGGED' },
  { agent: 'Spot Agent', message: '已核验活跃资产流动性阈值。', status: 'MONITORING' },
  { agent: 'Futures Trend Agent', message: '当前没有趋势入场信号通过风控门槛。', status: 'NO ACTION' },
];

const messageTranslations: Readonly<Record<string, string>> = {
  'Market volatility increased.': '市场波动率上升。',
  'Reduced BTC exposure by 8%.': 'BTC 敞口降低 8%。',
  'Detected increasing stablecoin inflow.': '检测到稳定币资金流入增加。',
  'BTC trend signal detected.': '检测到 BTC 趋势信号。',
  'Liquidity reserves verified across all fund domains.': '已完成各资金域流动性储备核验。',
};

export function ActivityFeed({ initial }: { readonly initial: readonly ActivityItem[] }) {
  const [items, setItems] = useState(() => initial.map((item) => ({ ...item, message: messageTranslations[item.message] ?? item.message })));
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
  const tone = (agent: string) => agent.includes('Risk') ? 'var(--red)' : agent.includes('Futures') ? 'var(--blue)' : agent.includes('Spot') || agent.includes('Research') ? 'var(--cyan)' : 'white';
  return <div className="glass overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-white/[.05] p-5"><p className="eyebrow">LIVE SYSTEM FEED · DEMO</p><span className="flex items-center gap-2 text-[9px] tracking-wider text-[var(--success)]"><i className="system-pulse size-1.5 rounded-full bg-[var(--success)]" />STREAMING</span></div><div>{items.map((item, index) => <motion.article initial={index === 0 ? { opacity: 0, y: -8 } : false} animate={{ opacity: 1, y: 0 }} key={`${item.time}-${item.agent}-${String(index)}`} className="grid gap-3 border-b border-white/[.04] p-5 sm:grid-cols-[90px_190px_1fr_auto] sm:items-center"><time className="font-mono text-xs text-white/30">{item.time}</time><strong className="flex items-center gap-3 text-sm font-normal"><i className="size-1.5 rounded-full" style={{ background: tone(item.agent) }} />{item.agent}</strong><p className="text-sm text-white/55">{item.message}</p>{item.status && <span className="text-[9px] tracking-[.12em]" style={{ color: tone(item.agent) }}>{item.status}</span>}</motion.article>)}</div></div>;
}
