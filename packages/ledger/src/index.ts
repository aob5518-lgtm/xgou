import { Decimal } from 'decimal.js';

Decimal.set({ precision: 80, rounding: Decimal.ROUND_DOWN });

export const FUND_DOMAINS = ['BULL', 'SPOT', 'FUTURES'] as const;
export type FundDomain = (typeof FUND_DOMAINS)[number];

export const LEDGER_ACCOUNT_TYPES = [
  'DEPOSIT_CLEARING',
  'USER_PRINCIPAL',
  'BULL_VAULT',
  'SPOT_TREASURY',
  'SPOT_STRATEGY',
  'FUTURES_TREASURY',
  'FUTURES_STRATEGY',
  'REWARD_VAULT',
  'REWARD_PAYABLE',
  'WITHDRAWAL_BUFFER',
  'ECOSYSTEM_FUND',
  'PLATFORM_TREASURY',
  'FEE_EXPENSE',
  'TRADING_PNL',
  'FUNDING_EXPENSE',
] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];
export type LedgerSide = 'DEBIT' | 'CREDIT';
export type NormalBalance = LedgerSide;

export interface MoneyInput {
  readonly amount: Decimal.Value;
  readonly asset: string;
  readonly chainId?: string;
  readonly decimals: number;
}

export class Money {
  readonly amount: Decimal;
  readonly asset: string;
  readonly chainId: string | undefined;
  readonly decimals: number;

  constructor(input: MoneyInput) {
    const amount = new Decimal(input.amount);
    if (!amount.isFinite() || amount.isNegative()) throw new RangeError('money amount must be finite and non-negative');
    if (amount.decimalPlaces() > 18) throw new RangeError('ledger precision is limited to 18 decimal places');
    if (!/^[A-Z0-9]{2,12}$/.test(input.asset)) throw new RangeError('asset must be an uppercase symbol');
    if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 255) {
      throw new RangeError('token decimals must be an integer between 0 and 255');
    }
    if (amount.decimalPlaces() > input.decimals) {
      throw new RangeError('money amount exceeds the token decimal precision');
    }
    this.amount = amount;
    this.asset = input.asset;
    this.chainId = input.chainId;
    this.decimals = input.decimals;
  }

  withAmount(amount: Decimal.Value): Money {
    return new Money({
      amount,
      asset: this.asset,
      decimals: this.decimals,
      ...(this.chainId === undefined ? {} : { chainId: this.chainId }),
    });
  }

  toJSON(): MoneyInput {
    return {
      amount: this.amount.toFixed(),
      asset: this.asset,
      decimals: this.decimals,
      ...(this.chainId === undefined ? {} : { chainId: this.chainId }),
    };
  }
}

export interface FundAllocationConfig {
  readonly bullAllocation: Decimal.Value;
  readonly spotStrategyAllocation: Decimal.Value;
  readonly futuresStrategyAllocation: Decimal.Value;
}

export interface FundAllocationResult {
  readonly BULL: Money;
  readonly SPOT: Money;
  readonly FUTURES: Money;
}

export class LedgerInvariantError extends Error {}

export const validateFundAllocation = (config: FundAllocationConfig): void => {
  const values = [
    new Decimal(config.bullAllocation),
    new Decimal(config.spotStrategyAllocation),
    new Decimal(config.futuresStrategyAllocation),
  ];
  if (values.some((value) => !value.isFinite() || value.isNegative() || value.gt(1))) {
    throw new LedgerInvariantError('fund allocations must each be between 0 and 1');
  }
  if (!values.reduce((sum, value) => sum.plus(value), new Decimal(0)).eq(1)) {
    throw new LedgerInvariantError('fund allocations must total exactly 1.00');
  }
};

export const allocateDeposit = (deposit: Money, config: FundAllocationConfig): FundAllocationResult => {
  validateFundAllocation(config);
  const bull = deposit.amount.mul(config.bullAllocation).toDecimalPlaces(deposit.decimals, Decimal.ROUND_DOWN);
  const spot = deposit.amount.mul(config.spotStrategyAllocation).toDecimalPlaces(deposit.decimals, Decimal.ROUND_DOWN);
  const futures = deposit.amount.minus(bull).minus(spot);
  if (!bull.gt(0) || !spot.gt(0) || !futures.gt(0)) {
    throw new LedgerInvariantError('deposit is too small to allocate positive amounts to every fund domain');
  }
  return { BULL: deposit.withAmount(bull), SPOT: deposit.withAmount(spot), FUTURES: deposit.withAmount(futures) };
};

export interface LedgerAccountRef {
  readonly id: string;
  readonly type: LedgerAccountType;
  readonly asset: string;
  readonly fundDomain?: FundDomain;
}

export interface JournalEntryDraft {
  readonly accountId: string;
  readonly side: LedgerSide;
  readonly money: Money;
  readonly fundDomain?: FundDomain;
}

export interface JournalDraft {
  readonly kind: 'DEPOSIT_CONFIRMATION' | 'FUND_ALLOCATION';
  readonly entries: readonly JournalEntryDraft[];
}

export interface DepositJournalAccounts {
  readonly depositClearing: LedgerAccountRef;
  readonly userPrincipal: LedgerAccountRef;
  readonly bullVault: LedgerAccountRef;
  readonly spotTreasury: LedgerAccountRef;
  readonly futuresTreasury: LedgerAccountRef;
}

const assertAccount = (
  account: LedgerAccountRef,
  type: LedgerAccountType,
  asset: string,
  fundDomain?: FundDomain,
): void => {
  if (account.type !== type || account.asset !== asset || account.fundDomain !== fundDomain) {
    throw new LedgerInvariantError(`account ${account.id} violates the required ${type} fund boundary`);
  }
};

export const assertBalanced = (entries: readonly JournalEntryDraft[]): void => {
  if (entries.length < 2) throw new LedgerInvariantError('a journal requires at least two entries');
  const assets = new Set(entries.map((entry) => entry.money.asset));
  for (const asset of assets) {
    const assetEntries = entries.filter((entry) => entry.money.asset === asset);
    const debit = assetEntries
      .filter((entry) => entry.side === 'DEBIT')
      .reduce((sum, entry) => sum.plus(entry.money.amount), new Decimal(0));
    const credit = assetEntries
      .filter((entry) => entry.side === 'CREDIT')
      .reduce((sum, entry) => sum.plus(entry.money.amount), new Decimal(0));
    if (!debit.eq(credit)) throw new LedgerInvariantError(`journal is not balanced for ${asset}`);
  }
};

export const buildDepositJournals = (
  deposit: Money,
  allocations: FundAllocationResult,
  accounts: DepositJournalAccounts,
): readonly [JournalDraft, JournalDraft] => {
  assertAccount(accounts.depositClearing, 'DEPOSIT_CLEARING', deposit.asset);
  assertAccount(accounts.userPrincipal, 'USER_PRINCIPAL', deposit.asset);
  assertAccount(accounts.bullVault, 'BULL_VAULT', deposit.asset, 'BULL');
  assertAccount(accounts.spotTreasury, 'SPOT_TREASURY', deposit.asset, 'SPOT');
  assertAccount(accounts.futuresTreasury, 'FUTURES_TREASURY', deposit.asset, 'FUTURES');
  const confirmation: JournalDraft = {
    kind: 'DEPOSIT_CONFIRMATION',
    entries: [
      { accountId: accounts.depositClearing.id, side: 'DEBIT', money: deposit },
      { accountId: accounts.userPrincipal.id, side: 'CREDIT', money: deposit },
    ],
  };
  const allocation: JournalDraft = {
    kind: 'FUND_ALLOCATION',
    entries: [
      { accountId: accounts.bullVault.id, side: 'DEBIT', money: allocations.BULL, fundDomain: 'BULL' },
      { accountId: accounts.spotTreasury.id, side: 'DEBIT', money: allocations.SPOT, fundDomain: 'SPOT' },
      { accountId: accounts.futuresTreasury.id, side: 'DEBIT', money: allocations.FUTURES, fundDomain: 'FUTURES' },
      { accountId: accounts.depositClearing.id, side: 'CREDIT', money: deposit },
    ],
  };
  assertBalanced(confirmation.entries);
  assertBalanced(allocation.entries);
  return [confirmation, allocation];
};

export const deriveAccountBalance = (
  entries: readonly Pick<JournalEntryDraft, 'side' | 'money'>[],
  normalBalance: NormalBalance,
): Decimal => {
  return entries.reduce((balance, entry) => {
    const signed = entry.side === normalBalance ? entry.money.amount : entry.money.amount.negated();
    return balance.plus(signed);
  }, new Decimal(0));
};
