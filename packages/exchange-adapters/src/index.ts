import { Decimal } from 'decimal.js';
import type { RiskEvaluation } from '@xgou/risk-engine';
export * from './production.js';
export * from './operational.js';

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
    const quantity = order.side === 'BUY'
      ? grossNotional.minus(grossNotional.mul(this.config.tradingFeeBps).div(10_000)).div(fillPrice)
      : Decimal.min(new Decimal(order.quantity ?? 0), grossNotional.div(fillPrice));
    if (quantity.lte(0)) throw new Error('paper fill quantity must be positive');
    const notional = order.side === 'BUY' ? grossNotional : quantity.mul(fillPrice);
    const fee = notional.mul(this.config.tradingFeeBps).div(10_000);
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
  readonly reserveBalance?: string;
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
  const equity = new Decimal(account.cashBalance).plus(account.reserveBalance ?? 0).plus(marketValue);
  const highWaterMark = Decimal.max(account.highWaterMark, equity);
  const drawdown = highWaterMark.isZero() ? new Decimal(0) : equity.minus(highWaterMark).div(highWaterMark);
  return { marketValue: marketValue.toFixed(), equity: equity.toFixed(), unrealizedPnl: marketValue.minus(costBasis).toFixed(), highWaterMark: highWaterMark.toFixed(), drawdown: drawdown.toFixed() };
};

export interface PaperCapitalState {
  readonly allocatedCapital: string;
  readonly activeCapital: string;
  readonly cashBalance: string;
  readonly reserveBalance: string;
}

export const rebalancePaperCapital = (
  account: PaperCapitalState,
  allocatedCapital: Decimal.Value,
  reserveRatio: Decimal.Value,
): PaperCapitalState => {
  const allocated = new Decimal(allocatedCapital);
  const ratio = new Decimal(reserveRatio);
  if (allocated.lt(0) || ratio.lt(0) || ratio.gt(1)) throw new Error('invalid paper capital allocation');
  const reserve = allocated.mul(ratio);
  const active = allocated.minus(reserve);
  const cash = new Decimal(account.cashBalance).plus(active.minus(account.activeCapital));
  if (!active.plus(reserve).eq(allocated)) throw new Error('paper capital conservation failed');
  return {
    allocatedCapital: allocated.toFixed(), activeCapital: active.toFixed(),
    cashBalance: cash.toFixed(), reserveBalance: reserve.toFixed(),
  };
};

export interface PeriodPnlState {
  readonly openingNav: string;
  readonly baselineAt: Date | null;
}

export interface PeriodPnlResult extends PeriodPnlState {
  readonly pnl: string;
  readonly pnlRatio: string;
}

export const utcDayStart = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

export const utcWeekStart = (value: Date): Date => {
  const day = utcDayStart(value);
  const daysFromMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysFromMonday);
  return day;
};

export const calculatePeriodPnl = (
  nav: Decimal.Value,
  previous: PeriodPnlState,
  boundary: Date,
): PeriodPnlResult => {
  const current = new Decimal(nav);
  const reset = previous.baselineAt === null || previous.baselineAt.getTime() < boundary.getTime();
  const opening = reset ? current : new Decimal(previous.openingNav);
  const pnl = reset ? new Decimal(0) : current.minus(opening);
  return {
    openingNav: opening.toFixed(), baselineAt: boundary, pnl: pnl.toFixed(),
    pnlRatio: opening.isZero() ? '0' : pnl.div(opening).toFixed(),
  };
};

export class LiveExchangeAdapter implements ExchangeAdapter {
  constructor() {
    if (process.env.REAL_TRADING_ENABLED !== 'true') throw new Error('live exchange adapters are disabled');
    throw new Error('no live exchange adapter exists in Phase 3A');
  }
  execute(): Promise<PaperFill> { throw new Error('live execution is unavailable'); }
}

export type PerpSide = 'LONG' | 'SHORT';
export type PerpAction = 'OPEN_LONG' | 'OPEN_SHORT' | 'REDUCE_LONG' | 'REDUCE_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';

export interface PaperPerpPositionState {
  readonly symbol: string;
  readonly side: PerpSide;
  readonly quantity: string;
  readonly averageEntryPrice: string;
  readonly leverage: string;
  readonly realizedPnl: string;
  readonly fundingPnl: string;
  readonly fees: string;
}

export interface PaperPerpFill {
  readonly action: PerpAction;
  readonly quantity: string;
  readonly price: string;
  readonly notional: string;
  readonly fee: string;
  readonly slippageBps: string;
  readonly sourcePrice: string;
}

export interface PaperPerpExecutionConfig {
  readonly takerFeeBps: string;
  readonly baseSlippageBps: string;
  readonly liquidityImpactBps: string;
  readonly maxSlippageBps: string;
}

export class PaperPerpExchangeAdapter {
  constructor(private readonly config: PaperPerpExecutionConfig) {}

  execute(action: PerpAction, notional: Decimal.Value, price: Decimal.Value, liquidity: Decimal.Value, reduceQuantity?: Decimal.Value): PaperPerpFill {
    const amount = new Decimal(notional);
    const mark = new Decimal(price);
    const depth = new Decimal(liquidity);
    if (amount.lte(0) || mark.lte(0) || depth.lte(0)) throw new Error('invalid paper perp order');
    const impact = amount.div(depth).mul(this.config.liquidityImpactBps);
    const slippageBps = Decimal.min(this.config.maxSlippageBps, new Decimal(this.config.baseSlippageBps).plus(impact));
    const buy = action === 'OPEN_LONG' || action === 'REDUCE_SHORT' || action === 'CLOSE_SHORT';
    const ratio = slippageBps.div(10_000);
    const fillPrice = buy ? mark.mul(ratio.plus(1)) : mark.mul(new Decimal(1).minus(ratio));
    const calculatedQuantity = amount.div(fillPrice);
    const quantity = reduceQuantity === undefined ? calculatedQuantity : Decimal.min(calculatedQuantity, reduceQuantity);
    const executedNotional = quantity.mul(fillPrice);
    return { action, quantity: quantity.toFixed(), price: fillPrice.toFixed(), notional: executedNotional.toFixed(), fee: executedNotional.mul(this.config.takerFeeBps).div(10_000).toFixed(), slippageBps: slippageBps.toFixed(), sourcePrice: mark.toFixed() };
  }
}

export const calculateLiquidationPrice = (
  side: PerpSide,
  entryPrice: Decimal.Value,
  leverage: Decimal.Value,
  maintenanceMarginRatio: Decimal.Value,
  feeBuffer: Decimal.Value,
): string => {
  const entry = new Decimal(entryPrice);
  const cushion = new Decimal(1).div(leverage).minus(maintenanceMarginRatio).minus(feeBuffer);
  if (cushion.lte(0)) throw new Error('leverage leaves no liquidation cushion');
  return (side === 'LONG' ? entry.mul(new Decimal(1).minus(cushion)) : entry.mul(cushion.plus(1))).toFixed();
};

export const calculateLiquidationDistance = (markPrice: Decimal.Value, liquidationPrice: Decimal.Value): string => {
  const mark = new Decimal(markPrice);
  if (mark.lte(0)) throw new Error('mark price must be positive');
  return mark.minus(liquidationPrice).abs().div(mark).toFixed();
};

export const calculatePerpUnrealizedPnl = (side: PerpSide, quantity: Decimal.Value, entryPrice: Decimal.Value, markPrice: Decimal.Value): string => {
  const move = side === 'LONG' ? new Decimal(markPrice).minus(entryPrice) : new Decimal(entryPrice).minus(markPrice);
  return move.mul(quantity).toFixed();
};

export const applyPerpFill = (
  current: PaperPerpPositionState | null,
  side: PerpSide,
  leverage: Decimal.Value,
  fill: PaperPerpFill,
): { readonly position: PaperPerpPositionState | null; readonly realizedPnlDelta: string; readonly marginDelta: string; readonly loss: boolean } => {
  const opening = fill.action === 'OPEN_LONG' || fill.action === 'OPEN_SHORT';
  const quantity = new Decimal(fill.quantity);
  const fillPrice = new Decimal(fill.price);
  const fee = new Decimal(fill.fee);
  if (opening) {
    if (current && current.side !== side) throw new Error('position flip is forbidden; close before opening opposite side');
    const oldQuantity = new Decimal(current?.quantity ?? 0);
    const total = oldQuantity.plus(quantity);
    const average = oldQuantity.mul(current?.averageEntryPrice ?? 0).plus(quantity.mul(fillPrice)).div(total);
    const oldMargin = oldQuantity.mul(current?.averageEntryPrice ?? 0).div(current?.leverage ?? leverage);
    const newMargin = total.mul(average).div(leverage);
    return {
      position: { symbol: current?.symbol ?? '', side, quantity: total.toFixed(), averageEntryPrice: average.toFixed(), leverage: new Decimal(leverage).toFixed(), realizedPnl: current?.realizedPnl ?? '0', fundingPnl: current?.fundingPnl ?? '0', fees: new Decimal(current?.fees ?? 0).plus(fee).toFixed() },
      realizedPnlDelta: fee.neg().toFixed(), marginDelta: newMargin.minus(oldMargin).toFixed(), loss: false,
    };
  }
  if (!current || current.side !== side) throw new Error('reduce requires an existing same-side position');
  const oldQuantity = new Decimal(current.quantity);
  if (quantity.gt(oldQuantity)) throw new Error('paper perp reduce exceeds position quantity');
  const gross = side === 'LONG' ? fillPrice.minus(current.averageEntryPrice).mul(quantity) : new Decimal(current.averageEntryPrice).minus(fillPrice).mul(quantity);
  const realized = gross.minus(fee);
  const remaining = oldQuantity.minus(quantity);
  const releasedMargin = quantity.mul(current.averageEntryPrice).div(current.leverage);
  return {
    position: remaining.isZero() ? null : { ...current, quantity: remaining.toFixed(), realizedPnl: new Decimal(current.realizedPnl).plus(realized).toFixed(), fees: new Decimal(current.fees).plus(fee).toFixed() },
    realizedPnlDelta: realized.toFixed(), marginDelta: releasedMargin.neg().toFixed(), loss: realized.lt(0),
  };
};

export const calculateFundingPayment = (side: PerpSide, notional: Decimal.Value, fundingRate: Decimal.Value): string => {
  const payment = new Decimal(notional).mul(fundingRate);
  return (side === 'LONG' ? payment.neg() : payment).toFixed();
};

export interface PerpMarkResult {
  readonly notional: string;
  readonly initialMargin: string;
  readonly maintenanceMargin: string;
  readonly unrealizedPnl: string;
  readonly liquidationPrice: string;
  readonly liquidationDistance: string;
  readonly liquidated: boolean;
}

export const markPerpPosition = (
  position: PaperPerpPositionState,
  markPrice: Decimal.Value,
  maintenanceMarginRatio: Decimal.Value,
  feeBuffer: Decimal.Value,
): PerpMarkResult => {
  const mark = new Decimal(markPrice);
  const notional = new Decimal(position.quantity).mul(mark);
  const liquidationPrice = calculateLiquidationPrice(position.side, position.averageEntryPrice, position.leverage, maintenanceMarginRatio, feeBuffer);
  const liquidated = position.side === 'LONG' ? mark.lte(liquidationPrice) : mark.gte(liquidationPrice);
  return {
    notional: notional.toFixed(), initialMargin: notional.div(position.leverage).toFixed(), maintenanceMargin: notional.mul(maintenanceMarginRatio).toFixed(),
    unrealizedPnl: calculatePerpUnrealizedPnl(position.side, position.quantity, position.averageEntryPrice, mark),
    liquidationPrice, liquidationDistance: calculateLiquidationDistance(mark, liquidationPrice), liquidated,
  };
};

export class LivePerpExchangeAdapter {
  constructor() { throw new Error('Phase 3B paper only: authenticated futures trading is unavailable'); }
}
