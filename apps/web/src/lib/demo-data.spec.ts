import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { demoData } from './demo-data';

describe('demo reward accounting', () => {
  it('derives share, gross reward, fee preview and net preview from canonical inputs', () => {
    const reward = demoData.rewards;
    const share = new Decimal(reward.userXp).div(reward.globalXp);
    const gross = new Decimal(reward.rewardPool).mul(share);
    const fee = gross.mul('0.05');

    expect(new Decimal(reward.shareRatio).minus(share).abs().lt('1e-15')).toBe(true);
    expect(new Decimal(reward.grossReward).minus(gross).abs().lt('1e-12')).toBe(true);
    expect(new Decimal(reward.feePreview).minus(fee).abs().lt('1e-12')).toBe(true);
    expect(new Decimal(reward.netPreview).minus(gross.minus(fee)).abs().lt('1e-12')).toBe(true);
  });
});
