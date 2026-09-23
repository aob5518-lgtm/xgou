import { describe, expect, it } from 'vitest';
import { calculateJoinAllocation, calculateRewardWithdrawal } from './finance';

describe('preview financial calculations', () => {
  it('allocates 10,000 into 5,000 Bull, 3,000 Spot and 2,000 Futures', () => {
    const result = calculateJoinAllocation('10000');
    expect(result.bull.toFixed()).toBe('5000');
    expect(result.spot.toFixed()).toBe('3000');
    expect(result.futures.toFixed()).toBe('2000');
    expect(result.bull.plus(result.spot).plus(result.futures).toFixed()).toBe(result.total.toFixed());
  });

  it('calculates the 5% reward withdrawal fee with Decimal', () => {
    const result = calculateRewardWithdrawal('1000');
    expect(result.fee.toFixed()).toBe('50');
    expect(result.receive.toFixed()).toBe('950');
  });
});
