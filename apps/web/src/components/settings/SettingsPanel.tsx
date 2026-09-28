'use client';

import { useEffect, useState } from 'react';
import { getChainConfig } from '@xgou/chains';
import { getAppMode } from '@/lib/app-mode';
import { readSession } from '@/services/auth-session';

const toggles = [{ key: 'reducedMotion', label: '减少动态效果' }, { key: 'notifications', label: '通知' }] as const;

export function SettingsPanel() {
  const [values, setValues] = useState<Record<string, boolean>>({ reducedMotion: false, notifications: true });
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const chain = getChainConfig(process.env.NEXT_PUBLIC_CHAIN_ENV); const mode = getAppMode();
  useEffect(() => { setWalletAddress(readSession()?.walletAddress ?? null); }, []);
  const rows = [
    ['已连接钱包', walletAddress ?? '未连接'], ['网络', chain.name], ['App Mode', mode.toUpperCase()], ['Arc Chain ID', String(chain.id)],
    ['Execution Mode', 'PAPER / SANDBOX DISABLED'], ['Trading status', 'REAL TRADING DISABLED'], ['Reward status', 'PAPER · NOT WITHDRAWABLE'],
    ['Mainnet', 'MAINNET DISABLED'], ['Withdrawals', 'WITHDRAWALS DISABLED'], ['语言', '中文 / English'],
  ];
  return <div className="glass overflow-hidden rounded-2xl">{rows.map(([label, value]) => <div key={label} className="grid gap-2 border-b border-white/[.05] p-5 sm:grid-cols-[220px_1fr]"><span className="text-sm">{label}</span><span className="break-all text-sm text-white/40">{value}</span></div>)}{toggles.map((row) => <div key={row.key} className="flex items-center justify-between border-b border-white/[.05] p-5"><span className="text-sm">{row.label}</span><button type="button" aria-label={row.label} aria-pressed={values[row.key]} onClick={() => { setValues((current) => ({ ...current, [row.key]: !current[row.key] })); }} className={`relative h-7 w-12 rounded-full transition ${values[row.key] ? 'bg-[var(--cyan)]' : 'bg-white/10'}`}><i className={`absolute top-1 size-5 rounded-full bg-white transition ${values[row.key] ? 'left-6' : 'left-1'}`}/></button></div>)}</div>;
}
