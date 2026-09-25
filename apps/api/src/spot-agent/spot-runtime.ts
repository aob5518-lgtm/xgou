import type { CircuitState } from '@xgou/risk-engine';

export const resolveCircuitTransition = (
  persisted: CircuitState,
  persistedReason: string | null,
  derived: CircuitState,
): CircuitState => {
  if (persisted === 'RISK_OFF') return 'RISK_OFF';
  if (persisted === 'PAUSED' && !persistedReason?.startsWith('DATA_FEED_')) return 'PAUSED';
  return derived;
};
