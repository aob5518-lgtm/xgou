import { describe, expect, it } from 'vitest';
import { allocateDeposit, assertBalanced, buildDepositJournals, Money } from '../src/index.js';

describe('10,000 USDC acceptance scenario', () => {
  it('routes all principal exactly once and keeps both journals balanced', () => {
    const deposit = new Money({ amount: '10000', asset: 'USDC', chainId: 'local-anvil', decimals: 6 });
    const allocation = allocateDeposit(deposit, {
      bullAllocation: '0.50',
      spotStrategyAllocation: '0.30',
      futuresStrategyAllocation: '0.20',
    });
    const journals = buildDepositJournals(deposit, allocation, {
      depositClearing: { id: 'deposit-clearing-usdc', type: 'DEPOSIT_CLEARING', asset: 'USDC' },
      userPrincipal: { id: 'user-principal-usdc', type: 'USER_PRINCIPAL', asset: 'USDC' },
      bullVault: { id: 'bull-vault-usdc', type: 'BULL_VAULT', asset: 'USDC', fundDomain: 'BULL' },
      spotTreasury: { id: 'spot-treasury-usdc', type: 'SPOT_TREASURY', asset: 'USDC', fundDomain: 'SPOT' },
      futuresTreasury: {
        id: 'futures-treasury-usdc',
        type: 'FUTURES_TREASURY',
        asset: 'USDC',
        fundDomain: 'FUTURES',
      },
    });
    journals.forEach((journal) => {
      assertBalanced(journal.entries);
    });
    expect(allocation.BULL.amount.toFixed()).toBe('5000');
    expect(allocation.SPOT.amount.toFixed()).toBe('3000');
    expect(allocation.FUTURES.amount.toFixed()).toBe('2000');
  });
});
