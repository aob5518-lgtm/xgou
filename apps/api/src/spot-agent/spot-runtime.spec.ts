import { describe, expect, it } from 'vitest';
import { resolveCircuitTransition } from './spot-runtime.js';

describe('spot circuit persistence and recovery', () => {
  it('restores automatic data pauses after healthy data returns', () => {
    expect(resolveCircuitTransition('PAUSED', 'DATA_FEED_STALE', 'RUNNING')).toBe('RUNNING');
  });

  it('does not automatically clear a manual pause or risk-off state', () => {
    expect(resolveCircuitTransition('PAUSED', 'ADMIN_PAUSED', 'RUNNING')).toBe('PAUSED');
    expect(resolveCircuitTransition('RISK_OFF', 'ADMIN_RISK_OFF', 'RUNNING')).toBe('RISK_OFF');
  });

  it('persists derived reduced-risk, paused and risk-off transitions', () => {
    expect(resolveCircuitTransition('RUNNING', null, 'REDUCED_RISK')).toBe('REDUCED_RISK');
    expect(resolveCircuitTransition('RUNNING', null, 'PAUSED')).toBe('PAUSED');
    expect(resolveCircuitTransition('RUNNING', null, 'RISK_OFF')).toBe('RISK_OFF');
  });
});
