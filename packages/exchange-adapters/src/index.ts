import { Decimal } from 'decimal.js';
import type { RiskEvaluation } from '@xgou/risk-engine';

export interface ExchangeAdapter {
  execute(order: PaperOrderInput, decision: RiskEvaluation, market: PaperMarket): Promise<PaperFill>;
}

export interface PaperOrderInput {
  readonly orderId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly notional: string;
  readonly quantity?: string;
}

export interface PaperMarket {
  readonly price: string;
  readonly liquidity: string;
  readonly timestamp: number;
}

export interface PaperExecutionConfig {
  readonly tradingFeeBps: string;
  readonly baseSlippageBps: string;
  readonly liquidityImpactBps: string;
  readonly maxSlippageBps: string;
}

export interface PaperFill {
  readonly orderId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly price: string;
  readonly notional: string;
  readonly fee: string;
  readonly slippage: string;
  readonly timestamp: number;
  readonly sourcePrice: string;
}

export class PaperSpotExchangeAdapter implements ExchangeAdapter {
  constructor(private readonly config: PaperExecutionConfig) {}

  async execute(order: PaperOrderInput, decision: RiskEvaluation, market: PaperMarket): Promise<PaperFill> {
    if (!['APPROVED', 'REDUCED'].includes(decision.decision)) throw new Error('paper execution requires an approved risk decision');
    const approved = new Decimal(decision.approvedNotional);
    const requested = new Decimal(order.notional);
    const grossNotional = Decimal.min(requested, approved);
    if (grossNotional.lte(0)) throw new Error('approved notional must be positive');
    const sourcePrice = new Decimal(market.price);
    const liquidity = new Decimal(market.liquidity);
    if (sourcePrice.lte(0) || liquidity.lte(0)) throw new Error('invalid paper market');
    const impact = grossNotional.div(liquidity).mul(this.config.liquidityImpactBps);
    const slippageBps = Decimal.min(this.config.maxSlippageBps, new Decimal(this.config.baseSlippageBps).plus(impact));
    const slippageRatio = slippageBps.div(10_000);
    const fillPrice = order.side === 'BUY' ? sourcePrice.mul(slippageRatio.plus(1)) : sourcePrice.mul(new Decimal(1).minus(slippageRatio));
    const fee = grossNotional.mul(this.config.tradingFeeBps).div(10_000);
    const quantity = order.side === 'BUY'
      ? grossNotional.minus(fee).div(fillPrice)
      : Decimal.min(new Decimal(order.quantity ?? 0), grossNotional.div(fillPrice));
    if (quantity.lte(0)) throw new Error('paper fill quantity must be positive');
    const notional = order.side === 'BUY' ? grossNotional : quantity.mul(fillPrice);
    return Promise.resolve({
      orderId: order.orderId, symbol: order.symbol, side: order.side, quantity: quantity.toFixed(),
      price: fillPrice.toFixed(), notional: notional.toFixed(), fee: fee.toFixed(),
      slippage: slippageRatio.toFixed(), timestamp: market.timestamp, sourcePrice: sourcePrice.toFixed(),
    });
  }
}

export interface PaperAccountState {
  readonly cashBalance: string;
  readonly realizedPnl: string;
  readonly highWaterMark: string;
}

export interface PaperPositionState {
  readonly symbol: string;
  readonly quantity: string;
  readonly averageEntryPrice: string;
  readonly realizedPnl: string;
}

export interface AccountingResult {
  readonly account: PaperAccountState;
  readonly position: PaperPositionState;
  readonly realizedPnlDelta: string;
}

export const applyPaperFill = (
  account: PaperAccountState,
  position: PaperPositionState,
  fill: PaperFill,
): AccountingResult => {
  const oldQuantity = new Decimal(position.quantity);
  const oldAverage = new Decimal(position.averageEntryPrice);
  const fillQuantity = new Decimal(fill.quantity);
  const fillNotional = new Decimal(fill.notional);
  const fee = new Decimal(fill.fee);
  if (fill.side === 'BUY') {
    if (new Decimal(account.cashBalance).lt(fillNotional)) throw new Error('paper account has insufficient cash');
    const newQuantity = oldQuantity.plus(fillQuantity);
    const cost = oldQuantity.mul(oldAverage).plus(fillNotional);
    const average = cost.div(newQuantity);
    return {
      account: { ...account, cashBalance: new Decimal(account.cashBalance).minus(fillNotional).toFixed() },
      position: { ...position, quantity: newQuantity.toFixed(), averageEntryPrice: average.toFixed() },
      realizedPnlDelta: '0',
    };
  }
  if (fillQuantity.gt(oldQuantity)) throw new Error('paper sell exceeds position quantity');
  const cost = fillQuantity.mul(oldAverage);
  const netProceeds = fillNotional.minus(fee);
  const realized = netProceeds.minus(cost);
  const remaining = oldQuantity.minus(fillQuantity);
  return {
    account: {
      ...account,
      cashBalance: new Decimal(account.cashBalance).plus(netProceeds).toFixed(),
      realizedPnl: new Decimal(account.realizedPnl).plus(realized).toFixed(),
    },
    position: {
      ...position,
      quantity: remaining.toFixed(),
      averageEntryPrice: remaining.isZero() ? '0' : oldAverage.toFixed(),
      realizedPnl: new Decimal(position.realizedPnl).plus(realized).toFixed(),
    },
    realizedPnlDelta: realized.toFixed(),
  };
};

export const markPaperNav = (
  account: PaperAccountState,
  positions: readonly (PaperPositionState & { readonly currentPrice: string })[],
): { readonly marketValue: string; readonly equity: string; readonly unrealizedPnl: string; readonly highWaterMark: string; readonly drawdown: string } => {
  const marketValue = positions.reduce((sum, position) => sum.plus(new Decimal(position.quantity).mul(position.currentPrice)), new Decimal(0));
  const costBasis = positions.reduce((sum, position) => sum.plus(new Decimal(position.quantity).mul(position.averageEntryPrice)), new Decimal(0));
  const equity = new Decimal(account.cashBalance).plus(marketValue);
  const highWaterMark = Decimal.max(account.highWaterMark, equity);
  const drawdown = highWaterMark.isZero() ? new Decimal(0) : equity.minus(highWaterMark).div(highWaterMark);
  return { marketValue: marketValue.toFixed(), equity: equity.toFixed(), unrealizedPnl: marketValue.minus(costBasis).toFixed(), highWaterMark: highWaterMark.toFixed(), drawdown: drawdown.toFixed() };
};

export class LiveExchangeAdapter implements ExchangeAdapter {
  constructor() {
    if (process.env.REAL_TRADING_ENABLED !== 'true') throw new Error('live exchange adapters are disabled');
    throw new Error('no live exchange adapter exists in Phase 3A');
  }
  execute(): Promise<PaperFill> { throw new Error('live execution is unavailable'); }
}
