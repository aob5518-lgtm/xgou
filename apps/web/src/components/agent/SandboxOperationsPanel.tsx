const row = (label: string, value: string, tone = 'text-white/65') => <div className="flex items-center justify-between border-b border-white/[.06] py-3 last:border-0"><span className="text-[10px] tracking-[.12em] text-white/35">{label}</span><span className={`text-xs ${tone}`}>{value}</span></div>;

export function SandboxOperationsPanel() {
  const configured = process.env.EXECUTION_MODE === 'SANDBOX'
    && process.env.SANDBOX_EXCHANGE_TRANSPORT_ENABLED === 'true'
    && process.env.BINANCE_ENVIRONMENT === 'TESTNET';
  return <section className="glass mt-4 rounded-2xl border border-amber-300/20 p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">BINANCE SANDBOX OPERATIONS</p><h2 className="mt-3 text-xl font-light">Controlled Testnet Execution</h2></div><span className="rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-[9px] tracking-[.14em] text-amber-200">TEST FUNDS · NO REAL ASSETS</span></div>
    <div className="mt-5 grid gap-x-8 md:grid-cols-2">
      <div>{row('ENVIRONMENT', 'TESTNET', 'text-cyan-300')}{row('EXECUTION MODE', configured ? 'SANDBOX' : 'PAPER / DRY RUN')}{row('TRANSPORT', configured ? 'ENV GATE READY' : 'DISABLED BY DEFAULT', configured ? 'text-amber-200' : 'text-white/45')}</div>
      <div>{row('SPOT', 'BINANCE SPOT TESTNET')}{row('FUTURES', 'USDⓈ-M TESTNET · MAX 2×')}{row('WITHDRAWAL', 'FORBIDDEN', 'text-[var(--red)]')}</div>
    </div>
    <p className="mt-4 text-xs leading-6 text-white/35">启用真实 Testnet 网络请求仍需数据库双人审批、有效 Trade-only Credential、全局风控为 ACTIVE，且不得存在 UNKNOWN 订单或 CRITICAL 对账差异。</p>
  </section>;
}
