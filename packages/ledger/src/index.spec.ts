import { describe, expect, it } from 'vitest';
import {
  allocateDeposit,
  buildDepositJournals,
  deriveAccountBalance,
  LedgerInvariantError,
  Money,
  validateFundAllocation,
  type DepositJournalAccounts,
} from './index.js';

const config = {
  bullAllocation: '0.50',
  spotStrategyAllocation: '0.30',
  futuresStrategyAllocation: '0.20',
};

const accounts: DepositJournalAccounts = {
  depositClearing: { id: 'clearing', type: 'DEPOSIT_CLEARING', asset: 'USDC' },
  userPrincipal: { id: 'principal', type: 'USER_PRINCIPAL', asset: 'USDC' },
  bullVault: { id: 'bull', type: 'BULL_VAULT', asset: 'USDC', fundDomain: 'BULL' },
  spotTreasury: { id: 'spot', type: 'SPOT_TREASURY', asset: 'USDC', fundDomain: 'SPOT' },
  futuresTreasury: { id: 'futures', type: 'FUTURES_TREASURY', asset: 'USDC', fundDomain: 'FUTURES' },
};

describe('fund allocation', () => {
  it('allocates 10,000 USDC into 5,000 / 3,000 / 2,000', () => {
    const allocated = allocateDeposit(new Money({ amount: '10000', asset: 'USDC', decimals: 6 }), config);
    expect(allocated.BULL.amount.toFixed()).toBe('5000');
    expect(allocated.SPOT.amount.toFixed()).toBe('3000');
    expect(allocated.FUTURES.amount.toFixed()).toBe('2000');
  });

  it('rejects both unallocated and over-allocated configurations', () => {
    expect(() => {
      validateFundAllocation({ ...config, futuresStrategyAllocation: '0.19' });
    }).toThrow(LedgerInvariantError);
    expect(() => {
      validateFundAllocation({ ...config, futuresStrategyAllocation: '0.21' });
    }).toThrow(LedgerInvariantError);
  });

  it('preserves every ledger atom by assigning rounding remainder deterministically', () => {
    const deposit = new Money({ amount: '0.000000000000000007', asset: 'USDC', decimals: 18 });
    const allocated = allocateDeposit(deposit, config);
    expect(allocated.BULL.amount.plus(allocated.SPOT.amount).plus(allocated.FUTURES.amount).toFixed(18)).toBe(
      deposit.amount.toFixed(18),
    );
  });

  it('rejects amounts that cannot fund every domain at token precision', () => {
    expect(() => allocateDeposit(new Money({ amount: '0.000001', asset: 'USDC', decimals: 6 }), config)).toThrow(
      LedgerInvariantError,
    );
  });

  it('rejects amounts with more precision than the token supports', () => {
    expect(() => new Money({ amount: '1.0000001', asset: 'USDC', decimals: 6 })).toThrow(RangeError);
  });
});

describe('double-entry journals', () => {
  it('creates balanced deposit confirmation and 50/30/20 allocation journals', () => {
    const deposit = new Money({ amount: '10000', asset: 'USDC', decimals: 6 });
    const journals = buildDepositJournals(deposit, allocateDeposit(deposit, config), accounts);
    expect(journals[0].entries.map((entry) => [entry.side, entry.money.amount.toFixed()])).toEqual([
      ['DEBIT', '10000'],
      ['CREDIT', '10000'],
    ]);
    expect(journals[1].entries.map((entry) => [entry.side, entry.money.amount.toFixed()])).toEqual([
      ['DEBIT', '5000'],
      ['DEBIT', '3000'],
      ['DEBIT', '2000'],
      ['CREDIT', '10000'],
    ]);
  });

  it('rejects crossing Spot funds into a Futures account', () => {
    const deposit = new Money({ amount: '100', asset: 'USDC', decimals: 6 });
    expect(() =>
      buildDepositJournals(deposit, allocateDeposit(deposit, config), {
        ...accounts,
        spotTreasury: { ...accounts.spotTreasury, fundDomain: 'FUTURES' },
      }),
    ).toThrow(LedgerInvariantError);
  });

  it('derives balances from entries instead of a mutable balance field', () => {
    const deposit = new Money({ amount: '100', asset: 'USDC', decimals: 6 });
    expect(
      deriveAccountBalance(
        [
          { side: 'DEBIT', money: deposit },
          { side: 'CREDIT', money: deposit.withAmount('25') },
        ],
        'DEBIT',
      ).toFixed(),
    ).toBe('75');
  });
});
