'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Bot, ChartNoAxesCombined, CircleDollarSign, Gauge, Network, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { WalletButton } from './WalletButton';

export const appRoutes = [
  { href: '/dashboard', label: 'Overview', icon: Gauge },
  { href: '/bull-fund', label: 'Bull Fund', icon: ChartNoAxesCombined },
  { href: '/agent', label: 'Agent', icon: Bot },
  { href: '/rewards', label: 'Rewards', icon: CircleDollarSign },
  { href: '/xp', label: 'XP Network', icon: Network },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/join', label: 'Join XGOU', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function AppShell({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[var(--background)] pb-24 lg:pb-0">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[var(--border)] bg-[#07090b]/95 p-6 lg:flex lg:flex-col">
        <Logo />
        <div className="mt-12 flex flex-1 flex-col gap-1">
          {appRoutes.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[var(--text-secondary)] transition hover:bg-white/[.04] hover:text-white', pathname === href && 'bg-white/[.06] text-white')}><Icon size={17} />{label}</Link>)}
        </div>
        <p className="text-[10px] leading-5 tracking-[.12em] text-white/30">DEMO ENVIRONMENT<br />NO REAL ASSETS</p>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[var(--border)] bg-[#050607]/80 px-5 backdrop-blur-xl md:px-8">
          <div className="lg:hidden"><Logo compact /></div>
          <div className="hidden items-center gap-3 text-[10px] tracking-[.18em] text-white/45 sm:flex"><span className="size-1.5 rounded-full bg-[var(--success)] shadow-[0_0_10px_var(--success)]" />ARC DEMO · SYSTEM ONLINE</div>
          <div className="flex items-center gap-3"><span className="rounded-full border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-3 py-2 text-[9px] tracking-[.18em] text-[var(--warning)]">DEMO MODE</span><WalletButton /></div>
        </header>
        <main className="mx-auto max-w-[1600px] px-5 py-8 md:px-8 md:py-10">{children}</main>
        <footer className="border-t border-[var(--border)] px-6 py-8 text-center text-[10px] tracking-[.16em] text-white/30">DEMO ENVIRONMENT. NO REAL ASSETS OR LIVE TRADING.</footer>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-2xl border border-[var(--border)] bg-[#0a0c0f]/95 px-2 shadow-2xl backdrop-blur-xl lg:hidden">
        {appRoutes.slice(0, 7).map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-label={label} className={cn('grid min-w-10 place-items-center gap-1 text-[8px] text-white/40', pathname === href && 'text-white')}><Icon size={18} /><span className="hidden min-[390px]:block">{label.split(' ')[0]}</span></Link>)}
      </nav>
    </div>
  );
}
