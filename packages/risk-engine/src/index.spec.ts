import { describe, expect, it } from 'vitest';
import { deriveCircuitState, evaluateSpotRisk, type SpotRiskConfig, type SpotRiskContext } from './index.js';

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
