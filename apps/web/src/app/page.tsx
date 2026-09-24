'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { XgouBrain } from '@/components/brain/XgouBrain';
import { WalletButton } from '@/components/layout/WalletButton';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

const engines = [
  { name: 'BULL FUND', share: '50%', tone: 'var(--red)', copy: '通过 AI 研究、资产筛选和动态退出策略，布局完整 Crypto 市场周期。' },
  { name: 'SPOT AGENT', share: '30%', tone: 'var(--cyan)', copy: '通过系统化趋势和波动策略，持续寻找阶段性 Alpha。' },
  { name: 'FUTURES TREND', share: '20%', tone: 'var(--blue)', copy: '在明确趋势出现时参与市场，并通过 Risk Engine 控制整体风险。' },
];

export default function LandingPage() {
  return <main className="grid-noise overflow-hidden">
    <section className="relative flex min-h-screen flex-col px-5 py-6 md:px-10">
      <nav className="relative z-10 flex items-center justify-between"><Logo /><div className="flex items-center gap-3"><Link href="/dashboard" className="hidden text-[10px] tracking-[.18em] text-white/55 sm:block">ENTER APP</Link><WalletButton /></div></nav>
      <div className="relative z-10 mx-auto mt-10 w-full max-w-[760px] text-center md:mt-12">
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="eyebrow">AI CRYPTO CYCLE INTELLIGENCE · PREVIEW</motion.p>
        <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="display mt-4 text-gradient">XGOU</motion.h1>
        <p className="mt-4 text-sm tracking-[.06em] text-white/65 md:text-base">AI 驱动的加密周期资产管理系统</p>
      </div>
      <div className="relative mx-auto -mt-8 w-full max-w-6xl flex-1"><XgouBrain /></div>
      <div className="relative z-10 mx-auto mt-1 max-w-2xl text-center"><p className="text-sm leading-7 text-white/55">你负责参与，Agent 负责执行。</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button asChild><Link href="/dashboard">START XGOU <ArrowRight size={14} /></Link></Button><Button asChild variant="outline"><Link href="#system">EXPLORE SYSTEM <ArrowDown size={14} /></Link></Button></div><p className="mt-7 text-[9px] tracking-[.24em] text-white/25">BUILT FOR THE NEXT CRYPTO CYCLE.</p></div>
    </section>

    <section id="system" className="mx-auto max-w-7xl px-5 py-32 md:px-10"><p className="eyebrow">CAPITAL ARCHITECTURE</p><h2 className="section-title mt-5 max-w-4xl">ONE CAPITAL.<br /><span className="text-white/30">THREE ENGINES.</span></h2><div className="mt-16 grid gap-4 md:grid-cols-3">{engines.map((engine, index) => <motion.article key={engine.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .12 }} className="glass min-h-72 rounded-2xl p-6"><span className="block h-px w-12" style={{ background: engine.tone }} /><div className="mt-14 flex items-end justify-between"><h3 className="text-xl tracking-tight">{engine.name}</h3><b className="text-4xl font-light" style={{ color: engine.tone }}>{engine.share}</b></div><p className="mt-8 text-sm leading-7 text-white/45">{engine.copy}</p></motion.article>)}</div></section>

    <section className="border-y border-[var(--border)] bg-white/[.015] px-5 py-32 md:px-10"><div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1fr_.8fr]"><div><p className="eyebrow">CAPITAL CONTROL</p><h2 className="section-title mt-5">AI DOESN’T<br />CONTROL CAPITAL.<br /><span className="text-[var(--red)]">RISK DOES.</span></h2><p className="mt-8 max-w-xl text-sm leading-7 text-white/45">AI 只负责研究与结构化信号。每一个执行请求必须经过独立 Risk Engine；Agent 没有提现权限，也不能修改自己的风险上限。</p></div><div className="my-auto space-y-2">{['RESEARCH AGENT','STRATEGY ENGINE','RISK ENGINE','EXECUTION ENGINE','MARKET'].map((step, index) => <div key={step} className={`glass flex items-center justify-between rounded-xl px-5 py-4 ${step === 'RISK ENGINE' ? 'border-[var(--red)]/50' : ''}`}><span className="text-[10px] tracking-[.18em]">{step}</span><span className="text-white/20">0{index + 1}</span></div>)}</div></div></section>

    <section className="mx-auto max-w-7xl px-5 py-32 md:px-10"><div className="grid items-center gap-16 lg:grid-cols-2"><div><p className="eyebrow">REWARD WEIGHT</p><h2 className="section-title mt-5">XP<br />NETWORK</h2><p className="mt-7 max-w-lg text-sm leading-7 text-white/45">用户参与资金和有效网络贡献形成 XP。XP 决定 Agent 可分配收益的权重，不改变资金所有权。</p></div><div className="glass rounded-2xl p-6 md:p-9">{['PRINCIPAL XP + DYNAMIC XP','TOTAL XP','WEEKLY REWARD WEIGHT'].map((item, index) => <div key={item} className="flex items-center gap-4 py-5"><span className="grid size-8 place-items-center rounded-full border border-white/10 text-[10px] text-white/35">{index + 1}</span><span className="text-sm tracking-[.12em]">{item}</span></div>)}</div></div></section>
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] px-6 py-8 text-[10px] tracking-[.16em] text-white/30 md:flex-row"><Logo /><span>DEMO ENVIRONMENT. NO REAL ASSETS OR LIVE TRADING.</span><span>© 2026 XGOU</span></footer>
  </main>;
}
