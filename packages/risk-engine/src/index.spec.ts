import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { deriveCircuitState, evaluateFuturesRisk, evaluateSpotRisk, type FuturesRiskConfig, type FuturesRiskContext, type SpotRiskConfig, type SpotRiskContext } from './index.js';

const config: SpotRiskConfig = {
  allowedAssets: ['BTC/USDC', 'ETH/USDC', 'SOL/USDC'], maxSingleAssetExposure: '0.20', maxTotalSpotExposure: '0.80',
  maxPositionSize: '0.20', maxTradeSize: '0.20', maxOrderNotional: '1000', maxDailyLoss: '0.02',
  pauseDailyLoss: '0.03', maxWeeklyLoss: '0.05', maxDrawdown: '0.15', maxSlippage: '0.005',
  minLiquidity: '100000', maxVolatility: '0.08', stalePriceSeconds: 30, liquidityReserve: '0.20',
};
const context: SpotRiskContext = {
  equity: '3000', cashBalance: '2400', reserveAmount: '0', currentTotalExposure: '0', assetExposure: '0',
  dailyPnlRatio: '0', weeklyPnlRatio: '0', drawdown: '0', volatility: '0.02', marketLiquidity: '10000000',
  estimatedSlippage: '0.001', now: 1_000_000, circuitState: 'RUNNING',
};
const proposal = { symbol: 'BTC/USDC', side: 'BUY' as const, targetNotional: '300', currentExposure: '0', expectedPrice: '60000', maxSlippage: '0.005', marketDataTimestamp: 990_000 };

describe('spot risk engine', () => {
  it('approves a safe proposal', () => { expect(evaluateSpotRisk(proposal, context, config).decision).toBe('APPROVED'); });
  it('reduces an asset above the 20% cap', () => { expect(evaluateSpotRisk({ ...proposal, targetNotional: '1000' }, { ...context, assetExposure: '500' }, config).decision).toBe('REDUCED'); });
  it('rejects total exposure above 80%', () => { expect(evaluateSpotRisk(proposal, { ...context, currentTotalExposure: '2400' }, config).decision).toBe('REJECTED'); });
  it('rejects insufficient cash and reserve violations', () => { expect(evaluateSpotRisk(proposal, { ...context, cashBalance: '700', reserveAmount: '600' }, config).reasonCodes).toContain('INSUFFICIENT_CASH_OR_RESERVE'); });
  it('rejects stale market data', () => { expect(evaluateSpotRisk({ ...proposal, marketDataTimestamp: 900_000 }, context, config).reasonCodes).toContain('STALE_MARKET_DATA'); });
  it('rejects unknown assets', () => { expect(evaluateSpotRisk({ ...proposal, symbol: 'DOGE/USDC' }, context, config).reasonCodes).toContain('ASSET_NOT_WHITELISTED'); });
  it('rejects high volatility', () => { expect(evaluateSpotRisk(proposal, { ...context, volatility: '0.2' }, config).reasonCodes).toContain('VOLATILITY_LIMIT'); });
  it('derives reduced, paused and risk-off circuit states', () => {
    expect(deriveCircuitState('-0.02', '-0.01', config)).toBe('REDUCED_RISK');
    expect(deriveCircuitState('-0.03', '-0.01', config)).toBe('PAUSED');
    expect(deriveCircuitState('0', '-0.15', config)).toBe('RISK_OFF');
  });
  it('allows EXIT while risk-off', () => { expect(evaluateSpotRisk({ ...proposal, side: 'EXIT' }, { ...context, circuitState: 'RISK_OFF' }, config).decision).toBe('APPROVED'); });
  it('allows EXIT while paused', () => { expect(evaluateSpotRisk({ ...proposal, side: 'EXIT' }, { ...context, circuitState: 'PAUSED' }, config).decision).toBe('APPROVED'); });
  it('rejects BUY while risk-off', () => { expect(evaluateSpotRisk(proposal, { ...context, circuitState: 'RISK_OFF' }, config).reasonCodes).toContain('CIRCUIT_RISK_OFF'); });
  it('reduces BUY notional while reduced-risk', () => {
    const result = evaluateSpotRisk(proposal, { ...context, circuitState: 'REDUCED_RISK' }, config);
    expect(result.decision).toBe('REDUCED');
    expect(result.approvedNotional).toBe('150');
  });
  it('pauses at the configured weekly loss threshold', () => {
    expect(deriveCircuitState('0', '-0.01', config, true, '-0.05', config.maxWeeklyLoss)).toBe('PAUSED');
  });
  it('does not allow stale prices to force an EXIT', () => {
    const result = evaluateSpotRisk({ ...proposal, side: 'EXIT', marketDataTimestamp: 0 }, { ...context, circuitState: 'PAUSED' }, config);
    expect(result.reasonCodes).toContain('STALE_MARKET_DATA');
    expect(result.decision).toBe('REJECTED');
  });
});

const futuresConfig: FuturesRiskConfig = {
  allowedAssets: ['BTC/USDC-PERP', 'ETH/USDC-PERP', 'SOL/USDC-PERP'], maxLeverage: '3', maxPositionRisk: '0.02', maxAssetExposure: '0.20', maxGrossExposure: '0.65', maxNetExposure: '0.50', maxMarginUsage: '0.50', minLiquidationDistance: '0.20', maxOrderNotional: '25000', maxDailyLoss: '0.02', maxWeeklyLoss: '0.05', maxDrawdown: '0.15', maxFundingRateAbs: '0.001', maxSlippage: '0.005', maxVolatility: '0.12', minLiquidity: '1000000', stalePriceSeconds: 120, reducedRiskLeverage: '1.5', maintenanceMarginRatio: '0.01', liquidationFeeBuffer: '0.005',
};
const futuresContext: FuturesRiskContext = {
  equity: '1300', availableMargin: '1300', marginUsed: '0', grossExposure: '0', netExposure: '0', assetExposure: '0', dailyPnlRatio: '0', weeklyPnlRatio: '0', drawdown: '0', fundingRate: '0.0001', volatility: '0.02', marketLiquidity: '100000000', estimatedSlippage: '0.0005', now: 1_000_000, circuitState: 'RUNNING',
};
const futuresProposal = { symbol: 'BTC/USDC-PERP', side: 'OPEN_LONG' as const, requestedNotional: '100', requestedLeverage: '2', expectedPrice: '100', stopLoss: '95', maxSlippage: '0.005', marketDataTimestamp: 1_000_000 };

describe('futures risk engine', () => {
  it('requires a stop for every new LONG or SHORT', () => { expect(evaluateFuturesRisk({ ...futuresProposal, stopLoss: null }, futuresContext, futuresConfig).reasonCodes).toContain('STOP_LOSS_REQUIRED'); });
  it('reduces leverage above 3x', () => { const result = evaluateFuturesRisk({ ...futuresProposal, requestedLeverage: '4' }, futuresContext, futuresConfig); expect(result.approvedLeverage).toBe('3'); expect(result.decision).toBe('REDUCED'); });
  it('reduces 1000 notional at 5% stop distance to the 2% NAV risk budget', () => { const result = evaluateFuturesRisk({ ...futuresProposal, requestedNotional: '1000' }, futuresContext, futuresConfig); expect(result.decision).toBe('REDUCED'); expect(new Decimal(result.approvedNotional).lte(520)).toBe(true); expect(new Decimal(result.maxLossAtStop).lte(26)).toBe(true); });
  it('enforces asset, gross, net and margin caps', () => {
    expect(evaluateFuturesRisk(futuresProposal, { ...futuresContext, assetExposure: '260' }, futuresConfig).decision).toBe('REJECTED');
    expect(evaluateFuturesRisk(futuresProposal, { ...futuresContext, grossExposure: '845' }, futuresConfig).decision).toBe('REJECTED');
    expect(evaluateFuturesRisk(futuresProposal, { ...futuresContext, netExposure: '650' }, futuresConfig).decision).toBe('REJECTED');
    expect(evaluateFuturesRisk(futuresProposal, { ...futuresContext, marginUsed: '650', availableMargin: '650' }, futuresConfig).decision).toBe('REJECTED');
  });
  it('rejects unsafe liquidation distance and extreme funding', () => {
    expect(evaluateFuturesRisk({ ...futuresProposal, requestedLeverage: '5' }, futuresContext, { ...futuresConfig, maxLeverage: '10' }).reasonCodes).toContain('LIQUIDATION_DISTANCE_LIMIT');
    expect(evaluateFuturesRisk(futuresProposal, { ...futuresContext, fundingRate: '0.01' }, futuresConfig).reasonCodes).toContain('FUNDING_RATE_LIMIT');
  });
  it('allows reduce-only actions while risk-off', () => { expect(evaluateFuturesRisk({ ...futuresProposal, side: 'CLOSE_LONG' }, { ...futuresContext, circuitState: 'RISK_OFF' }, futuresConfig).decision).toBe('APPROVED'); });
});
