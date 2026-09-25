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

export type FuturesProposalSide = 'OPEN_LONG' | 'OPEN_SHORT' | 'REDUCE_LONG' | 'REDUCE_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';

export interface FuturesTradeProposalInput {
  readonly symbol: string;
  readonly side: FuturesProposalSide;
  readonly requestedNotional: string;
  readonly requestedLeverage: string;
  readonly expectedPrice: string;
  readonly stopLoss: string | null;
  readonly maxSlippage: string;
  readonly marketDataTimestamp: number;
}

export interface FuturesRiskConfig {
  readonly allowedAssets: readonly string[];
  readonly maxLeverage: string;
  readonly maxPositionRisk: string;
  readonly maxAssetExposure: string;
  readonly maxGrossExposure: string;
  readonly maxNetExposure: string;
  readonly maxMarginUsage: string;
  readonly minLiquidationDistance: string;
  readonly maxOrderNotional: string;
  readonly maxDailyLoss: string;
  readonly maxWeeklyLoss: string;
  readonly maxDrawdown: string;
  readonly maxFundingRateAbs: string;
  readonly maxSlippage: string;
  readonly maxVolatility: string;
  readonly minLiquidity: string;
  readonly stalePriceSeconds: number;
  readonly reducedRiskLeverage: string;
  readonly maintenanceMarginRatio: string;
  readonly liquidationFeeBuffer: string;
}

export interface FuturesRiskContext {
  readonly equity: string;
  readonly availableMargin: string;
  readonly marginUsed: string;
  readonly grossExposure: string;
  readonly netExposure: string;
  readonly assetExposure: string;
  readonly dailyPnlRatio: string;
  readonly weeklyPnlRatio: string;
  readonly drawdown: string;
  readonly fundingRate: string;
  readonly volatility: string;
  readonly marketLiquidity: string;
  readonly estimatedSlippage: string;
  readonly now: number;
  readonly circuitState: CircuitState;
}

export interface FuturesRiskEvaluation extends RiskEvaluation {
  readonly approvedLeverage: string;
  readonly projectedLiquidationDistance: string;
  readonly maxLossAtStop: string;
}

export const projectedLiquidationDistance = (
  leverage: Decimal.Value,
  maintenanceMarginRatio: Decimal.Value,
  feeBuffer: Decimal.Value,
): Decimal => Decimal.max(0, new Decimal(1).div(leverage).minus(maintenanceMarginRatio).minus(feeBuffer));

export const evaluateFuturesRisk = (
  proposal: FuturesTradeProposalInput,
  context: FuturesRiskContext,
  config: FuturesRiskConfig,
): FuturesRiskEvaluation => {
  const requested = new Decimal(proposal.requestedNotional);
  const price = new Decimal(proposal.expectedPrice);
  const equity = new Decimal(context.equity);
  const opening = proposal.side === 'OPEN_LONG' || proposal.side === 'OPEN_SHORT';
  const ageSeconds = new Decimal(context.now - proposal.marketDataTimestamp).div(1_000);
  const reasons: string[] = [];
  let leverage = Decimal.min(proposal.requestedLeverage, config.maxLeverage);
  if (new Decimal(proposal.requestedLeverage).gt(config.maxLeverage)) reasons.push('LEVERAGE_REDUCED');
  if (context.circuitState === 'REDUCED_RISK') leverage = Decimal.min(leverage, config.reducedRiskLeverage);
  const liquidationDistance = projectedLiquidationDistance(leverage, config.maintenanceMarginRatio, config.liquidationFeeBuffer);
  const stopDistance = proposal.stopLoss === null || price.isZero() ? new Decimal(0) : price.minus(proposal.stopLoss).abs().div(price);
  const maxLossAtStop = requested.mul(stopDistance);
  const commonMetrics = {
    equity: equity.toFixed(), grossExposure: new Decimal(context.grossExposure).toFixed(), netExposure: new Decimal(context.netExposure).toFixed(),
    marginUsed: new Decimal(context.marginUsed).toFixed(), availableMargin: new Decimal(context.availableMargin).toFixed(),
    stopDistance: stopDistance.toFixed(), fundingRate: new Decimal(context.fundingRate).toFixed(), volatility: new Decimal(context.volatility).toFixed(),
  };
  if (!config.allowedAssets.includes(proposal.symbol)) reasons.push('ASSET_NOT_WHITELISTED');
  if (ageSeconds.gt(config.stalePriceSeconds)) reasons.push('STALE_MARKET_DATA');
  if (!opening) {
    const hard = reasons.filter((reason) => ['ASSET_NOT_WHITELISTED', 'STALE_MARKET_DATA'].includes(reason));
    return { decision: hard.length ? 'REJECTED' : 'APPROVED', approvedNotional: hard.length ? '0' : requested.toFixed(), approvedLeverage: leverage.toFixed(), projectedLiquidationDistance: liquidationDistance.toFixed(), maxLossAtStop: maxLossAtStop.toFixed(), reasonCodes: hard, riskMetrics: commonMetrics, circuitState: context.circuitState };
  }
  if (proposal.stopLoss === null) reasons.push('STOP_LOSS_REQUIRED');
  if (equity.lte(0) || requested.lte(0) || price.lte(0) || leverage.lte(0)) reasons.push('INVALID_FUTURES_PROPOSAL');
  if (['PAUSED', 'RISK_OFF'].includes(context.circuitState)) reasons.push(`CIRCUIT_${context.circuitState}`);
  if (new Decimal(context.fundingRate).abs().gt(config.maxFundingRateAbs)) reasons.push('FUNDING_RATE_LIMIT');
  if (new Decimal(context.volatility).gt(config.maxVolatility)) reasons.push('VOLATILITY_LIMIT');
  if (new Decimal(context.marketLiquidity).lt(config.minLiquidity)) reasons.push('INSUFFICIENT_LIQUIDITY');
  if (new Decimal(context.estimatedSlippage).gt(config.maxSlippage) || new Decimal(proposal.maxSlippage).gt(config.maxSlippage)) reasons.push('SLIPPAGE_LIMIT');
  if (liquidationDistance.lt(config.minLiquidationDistance)) reasons.push('LIQUIDATION_DISTANCE_LIMIT');
  if (new Decimal(context.dailyPnlRatio).lte(new Decimal(config.maxDailyLoss).neg())) reasons.push('DAILY_LOSS_LIMIT');
  if (new Decimal(context.weeklyPnlRatio).lte(new Decimal(config.maxWeeklyLoss).neg())) reasons.push('WEEKLY_LOSS_LIMIT');
  if (new Decimal(context.drawdown).lte(new Decimal(config.maxDrawdown).neg())) reasons.push('DRAWDOWN_LIMIT');
  const hardRejectCodes = ['ASSET_NOT_WHITELISTED', 'STALE_MARKET_DATA', 'STOP_LOSS_REQUIRED', 'INVALID_FUTURES_PROPOSAL', 'CIRCUIT_PAUSED', 'CIRCUIT_RISK_OFF', 'FUNDING_RATE_LIMIT', 'VOLATILITY_LIMIT', 'INSUFFICIENT_LIQUIDITY', 'SLIPPAGE_LIMIT', 'LIQUIDATION_DISTANCE_LIMIT', 'DAILY_LOSS_LIMIT', 'WEEKLY_LOSS_LIMIT', 'DRAWDOWN_LIMIT'];
  if (reasons.some((reason) => hardRejectCodes.includes(reason))) return { decision: 'REJECTED', approvedNotional: '0', approvedLeverage: leverage.toFixed(), projectedLiquidationDistance: liquidationDistance.toFixed(), maxLossAtStop: maxLossAtStop.toFixed(), reasonCodes: reasons, riskMetrics: commonMetrics, circuitState: context.circuitState };

  const riskCap = stopDistance.isZero() ? new Decimal(0) : equity.mul(config.maxPositionRisk).div(stopDistance);
  const grossCap = equity.mul(config.maxGrossExposure).minus(context.grossExposure);
  const assetCap = equity.mul(config.maxAssetExposure).minus(context.assetExposure);
  const netRoom = proposal.side === 'OPEN_LONG'
    ? equity.mul(config.maxNetExposure).minus(context.netExposure)
    : equity.mul(config.maxNetExposure).plus(context.netExposure);
  const marginCap = Decimal.max(0, Decimal.min(context.availableMargin, equity.mul(config.maxMarginUsage).minus(context.marginUsed))).mul(leverage);
  const caps = [requested, new Decimal(config.maxOrderNotional), riskCap, grossCap, assetCap, netRoom, marginCap];
  if (context.circuitState === 'REDUCED_RISK') caps.push(requested.mul('0.5'));
  const approved = Decimal.max(0, Decimal.min(...caps));
  if (approved.lte(0)) return { decision: 'REJECTED', approvedNotional: '0', approvedLeverage: leverage.toFixed(), projectedLiquidationDistance: liquidationDistance.toFixed(), maxLossAtStop: '0', reasonCodes: [...reasons, 'FUTURES_EXPOSURE_OR_MARGIN_LIMIT'], riskMetrics: commonMetrics, circuitState: context.circuitState };
  const finalLoss = approved.mul(stopDistance);
  const reduced = approved.lt(requested) || leverage.lt(proposal.requestedLeverage);
  return { decision: reduced ? 'REDUCED' : 'APPROVED', approvedNotional: approved.toFixed(), approvedLeverage: leverage.toFixed(), projectedLiquidationDistance: liquidationDistance.toFixed(), maxLossAtStop: finalLoss.toFixed(), reasonCodes: reduced ? [...reasons, 'FUTURES_POSITION_REDUCED_TO_RISK_LIMIT'] : reasons, riskMetrics: commonMetrics, circuitState: context.circuitState };
};
