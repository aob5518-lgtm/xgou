import { AgentStatus } from '@/components/agent/AgentStatus';
import { PositionTable } from '@/components/agent/PositionTable';
import { StrategyCard } from '@/components/agent/StrategyCard';
import { NavChart } from '@/components/charts/NavChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber, formatUsd } from '@/lib/finance';
import { getXgouDataProvider } from '@/services/xgou-data-provider';

export default async function AgentPage() {
  const agent = await getXgouDataProvider().getAgentFund();
  return <><PageHeader eyebrow="AGENT SYSTEM · ONLINE" title="Autonomous strategy control room" description="现货捕捉波动，趋势策略参与明确行情；所有执行均受独立 Risk Engine 约束。" /><div className="grid gap-4 xl:grid-cols-2"><StrategyCard name="SPOT STRATEGY" allocation="30%" tone="cyan" metrics={[{ label: 'NAV', value: formatUsd(agent.spot.nav) }, { label: 'WEEKLY PNL', value: `+${String(agent.spot.weeklyPnl)}%` }, { label: 'MONTHLY PNL', value: `+${String(agent.spot.monthlyPnl)}%` }, { label: 'CASH RESERVE', value: `${String(agent.spot.cashReserve)}%` }, { label: 'EXPOSURE', value: `${String(agent.spot.exposure)}%` }, { label: 'RISK', value: agent.spot.risk }]} /><StrategyCard name="FUTURES TREND" allocation="20%" tone="blue" metrics={[{ label: 'NAV', value: formatUsd(agent.futures.nav) }, { label: 'REALIZED PNL', value: formatUsd(agent.futures.realizedPnl) }, { label: 'LEVERAGE', value: `${String(agent.futures.leverage)}×` }, { label: 'MARGIN USAGE', value: `${String(agent.futures.marginUsage)}%` }, { label: 'DRAWDOWN', value: `${String(agent.futures.drawdown)}%` }, { label: 'RISK', value: agent.futures.risk }]} /></div><div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]"><PositionTable positions={agent.positions} /><div className="glass rounded-2xl p-6"><p className="eyebrow">AGENT STATUS</p><div className="mt-4"><AgentStatus name="Research Agent" status="ONLINE" detail="市场广度与资金流分析" /><AgentStatus name="Spot Agent" status="ACTIVE" detail={`${formatNumber(agent.spot.exposure)}% 当前敞口`} /><AgentStatus name="Futures Trend" status="MONITORING" detail={`${String(agent.futures.leverage)}× 杠杆 · 上限 3×`} /><AgentStatus name="Risk Engine" status="ENFORCING" detail="每个执行提案均经过风控门控" /></div></div></div><div className="mt-4"><NavChart data={agent.pnlHistory} title="AGENT PNL · DEMO" color="var(--cyan)" /></div></>;
}
