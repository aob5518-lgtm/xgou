'use client';

import { useState } from 'react';

const rows = [{ key: 'reducedMotion', label: '减少动态效果' }, { key: 'notifications', label: '通知' }] as const;

export function SettingsPanel() {
  const [values, setValues] = useState<Record<string, boolean>>({ reducedMotion: false, notifications: true });
  return <div className="glass overflow-hidden rounded-2xl"><div className="grid gap-2 border-b border-white/[.05] p-5 sm:grid-cols-[220px_1fr]"><span className="text-sm">已连接钱包</span><span className="text-sm text-white/40">未连接 · 仅显示</span></div><div className="grid gap-2 border-b border-white/[.05] p-5 sm:grid-cols-[220px_1fr]"><span className="text-sm">网络</span><span className="text-sm text-white/40">Arc Demo Preview</span></div><div className="grid gap-2 border-b border-white/[.05] p-5 sm:grid-cols-[220px_1fr]"><span className="text-sm">语言</span><span className="text-sm text-white/40">中文 / English</span></div>{rows.map((row) => <div key={row.key} className="flex items-center justify-between border-b border-white/[.05] p-5"><span className="text-sm">{row.label}</span><button type="button" aria-label={row.label} aria-pressed={values[row.key]} onClick={() => { setValues((current) => ({ ...current, [row.key]: !current[row.key] })); }} className={`relative h-7 w-12 rounded-full transition ${values[row.key] ? 'bg-[var(--cyan)]' : 'bg-white/10'}`}><i className={`absolute top-1 size-5 rounded-full bg-white transition ${values[row.key] ? 'left-6' : 'left-1'}`} /></button></div>)}<div className="flex items-center justify-between p-5"><span className="text-sm">演示模式</span><span className="rounded-full bg-white/[.04] px-3 py-1 text-[10px] text-white/45">ENABLED · LOCKED</span></div></div>;
}
