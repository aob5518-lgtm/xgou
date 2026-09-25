import { Decimal } from 'decimal.js';

export type RiskDecisionType = 'APPROVED' | 'REDUCED' | 'REJECTED';
export type CircuitState = 'RUNNING' | 'REDUCED_RISK' | 'PAUSED' | 'RISK_OFF';
export type ProposalSide = 'BUY' | 'REDUCE' | 'EXIT';

export interface TradeProposalInput {
  readonly symbol: string;
  readonly side: ProposalSide;
  readonly targetNotional: string;
  readonly currentExposure: string;
  readonly expectedPrice: string;
  readonly maxSlippage: string;
  readonly marketDataTimestamp: number;
}

export interface SpotRiskConfig {
  readonly allowedAssets: readonly string[];
  readonly maxSingleAssetExposure: string;
  readonly maxTotalSpotExposure: string;
  readonly maxPositionSize: string;
  readonly maxTradeSize: string;
  readonly maxOrderNotional: string;
  readonly maxDailyLoss: string;
  readonly pauseDailyLoss: string;
  readonly maxWeeklyLoss: string;
  readonly maxDrawdown: string;
  readonly maxSlippage: string;
  readonly minLiquidity: string;
  readonly maxVolatility: string;
  readonly stalePriceSeconds: number;
  readonly liquidityReserve: string;
}

export interface SpotRiskContext {
  readonly equity: string;
  readonly cashBalance: string;
  readonly reserveAmount: string;
  readonly currentTotalExposure: string;
  readonly assetExposure: string;
  readonly dailyPnlRatio: string;
  readonly weeklyPnlRatio: string;
  readonly drawdown: string;
  readonly volatility: string;
  readonly marketLiquidity: string;
  readonly estimatedSlippage: string;
  readonly now: number;
  readonly circuitState: CircuitState;
}

export interface RiskEvaluation {
  readonly decision: RiskDecisionType;
  readonly approvedNotional: string;
  readonly reasonCodes: readonly string[];
  readonly riskMetrics: Readonly<Record<string, string>>;
  readonly circuitState: CircuitState;
}

export const deriveCircuitState = (
  dailyPnlRatio: Decimal.Value,
  drawdown: Decimal.Value,
  config: Pick<SpotRiskConfig, 'maxDailyLoss' | 'pauseDailyLoss' | 'maxDrawdown'>,
  dataHealthy = true,
  weeklyPnlRatio: Decimal.Value = 0,
  maxWeeklyLoss: Decimal.Value = 1,
): CircuitState => {
  if (!dataHealthy) return 'PAUSED';
  const dailyLoss = Decimal.min(0, dailyPnlRatio).abs();
  const weeklyLoss = Decimal.min(0, weeklyPnlRatio).abs();
  if (new Decimal(drawdown).lte(new Decimal(config.maxDrawdown).neg())) return 'RISK_OFF';
  if (weeklyLoss.gte(maxWeeklyLoss)) return 'PAUSED';
  if (dailyLoss.gte(config.pauseDailyLoss)) return 'PAUSED';
  if (dailyLoss.gte(config.maxDailyLoss)) return 'REDUCED_RISK';
  return 'RUNNING';
};

export const evaluateSpotRisk = (
  proposal: TradeProposalInput,
  context: SpotRiskContext,
  config: SpotRiskConfig,
): RiskEvaluation => {
  const reasons: string[] = [];
  const target = new Decimal(proposal.targetNotional);
  const equity = new Decimal(context.equity);
  const isBuy = proposal.side === 'BUY';
  const ageSeconds = new Decimal(context.now - proposal.marketDataTimestamp).div(1_000);
  const dataHealthy = ageSeconds.lte(config.stalePriceSeconds);
  const derivedCircuit = deriveCircuitState(context.dailyPnlRatio, context.drawdown, config, dataHealthy, context.weeklyPnlRatio, config.maxWeeklyLoss);
  const circuit = context.circuitState === 'RUNNING'
    ? derivedCircuit
    : context.circuitState === 'REDUCED_RISK' && derivedCircuit !== 'RUNNING'
      ? derivedCircuit
      : context.circuitState;
  if (!config.allowedAssets.includes(proposal.symbol)) reasons.push('ASSET_NOT_WHITELISTED');
  if (!dataHealthy) reasons.push('STALE_MARKET_DATA');
  if (new Decimal(context.marketLiquidity).lt(config.minLiquidity)) reasons.push('INSUFFICIENT_LIQUIDITY');
  if (new Decimal(context.volatility).gt(config.maxVolatility)) reasons.push('VOLATILITY_LIMIT');
  if (new Decimal(context.estimatedSlippage).gt(config.maxSlippage) || new Decimal(proposal.maxSlippage).gt(config.maxSlippage)) reasons.push('SLIPPAGE_LIMIT');
  if (new Decimal(context.weeklyPnlRatio).lte(new Decimal(config.maxWeeklyLoss).neg())) reasons.push('WEEKLY_LOSS_LIMIT');
  if (isBuy && ['PAUSED', 'RISK_OFF'].includes(circuit)) reasons.push(`CIRCUIT_${circuit}`);
  if (!isBuy) {
    const hardReasons = reasons.filter((reason) => ['ASSET_NOT_WHITELISTED', 'STALE_MARKET_DATA'].includes(reason));
    return { decision: hardReasons.length === 0 ? 'APPROVED' : 'REJECTED', approvedNotional: hardReasons.length === 0 ? target.toFixed() : '0', reasonCodes: hardReasons, riskMetrics: metrics(context), circuitState: circuit };
  }
  if (equity.lte(0) || target.lte(0)) reasons.push('INVALID_BUY_PROPOSAL');
  const availableCash = new Decimal(context.cashBalance).minus(context.reserveAmount);
  if (target.gt(availableCash)) reasons.push('INSUFFICIENT_CASH_OR_RESERVE');
  const hardReject = reasons.length > 0;
  if (hardReject) return { decision: 'REJECTED', approvedNotional: '0', reasonCodes: reasons, riskMetrics: metrics(context), circuitState: circuit };

  const caps = [
    new Decimal(config.maxOrderNotional),
    new Decimal(config.maxTradeSize).mul(equity),
    new Decimal(config.maxPositionSize).mul(equity).minus(context.assetExposure),
    new Decimal(config.maxSingleAssetExposure).mul(equity).minus(context.assetExposure),
    new Decimal(config.maxTotalSpotExposure).mul(equity).minus(context.currentTotalExposure),
    availableCash,
  ];
  if (circuit === 'REDUCED_RISK') caps.push(target.mul('0.5'));
  const approved = Decimal.max(0, Decimal.min(target, ...caps));
  if (approved.lte(0)) return { decision: 'REJECTED', approvedNotional: '0', reasonCodes: ['EXPOSURE_LIMIT'], riskMetrics: metrics(context), circuitState: circuit };
  if (approved.lt(target)) return { decision: 'REDUCED', approvedNotional: approved.toFixed(), reasonCodes: ['POSITION_REDUCED_TO_RISK_LIMIT'], riskMetrics: metrics(context), circuitState: circuit };
  return { decision: 'APPROVED', approvedNotional: approved.toFixed(), reasonCodes: [], riskMetrics: metrics(context), circuitState: circuit };
};

const metrics = (context: SpotRiskContext): Readonly<Record<string, string>> => ({
  equity: new Decimal(context.equity).toFixed(), cashBalance: new Decimal(context.cashBalance).toFixed(),
  totalExposure: new Decimal(context.currentTotalExposure).toFixed(), assetExposure: new Decimal(context.assetExposure).toFixed(),
  dailyPnlRatio: new Decimal(context.dailyPnlRatio).toFixed(), weeklyPnlRatio: new Decimal(context.weeklyPnlRatio).toFixed(),
  drawdown: new Decimal(context.drawdown).toFixed(), volatility: new Decimal(context.volatility).toFixed(),
});
