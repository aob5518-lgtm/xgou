import type { ExecutionState } from '../production.js';

export const normalizeBinanceOrderStatus = (status: string): ExecutionState => {
  switch (status) {
    case 'NEW': return 'ACKNOWLEDGED';
    case 'PARTIALLY_FILLED': return 'PARTIALLY_FILLED';
    case 'FILLED': return 'FILLED';
    case 'PENDING_CANCEL': return 'CANCEL_REQUESTED';
    case 'CANCELED': case 'EXPIRED': case 'EXPIRED_IN_MATCH': return 'CANCELLED';
    case 'REJECTED': return 'REJECTED';
    default: return 'UNKNOWN';
  }
};

export type BinanceErrorCategory = 'RATE_LIMIT' | 'IP_BANNED' | 'CLOCK_DRIFT' | 'AUTHENTICATION' | 'VALIDATION' | 'INSUFFICIENT_BALANCE' | 'UNKNOWN_EXECUTION' | 'EXCHANGE';

export const mapBinanceError = (status: number, code?: number): BinanceErrorCategory => {
  if (status === 418) return 'IP_BANNED';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500 || code === -1007) return 'UNKNOWN_EXECUTION';
  if (code === -1021) return 'CLOCK_DRIFT';
  if ([-2014, -2015].includes(code ?? 0)) return 'AUTHENTICATION';
  if (code === -2010) return 'INSUFFICIENT_BALANCE';
  if ([-1013, -1100, -1102].includes(code ?? 0)) return 'VALIDATION';
  return 'EXCHANGE';
};
