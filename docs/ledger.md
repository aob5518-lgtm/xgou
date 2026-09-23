# Double-entry Ledger

## Source of truth

`LedgerTransaction` groups immutable `LedgerEntry` rows. Each entry has an account, DEBIT/CREDIT side, positive Decimal amount, asset and optional fund domain. `LedgerAccount` has no balance column. Read models may cache balances later, but they must be reproducible from entries.

For a debit-normal account:

```text
balance = sum(DEBIT) - sum(CREDIT)
```

For a credit-normal account the sign is reversed. The domain package exposes the same deterministic reconstruction rule used by tests.

## Posting invariants

- At least two entries per journal.
- Debits equal credits independently for every asset.
- Entry asset equals LedgerAccount asset.
- Entry fund domain equals LedgerAccount fund domain.
- Amounts are positive and have at most 18 decimal places.
- Idempotency keys are unique.
- Posted transactions and entries cannot be updated or deleted.
- Errors are corrected using a new `REVERSAL` transaction.

Application validation fails early. PostgreSQL deferred constraint triggers repeat the critical balance and boundary checks at commit so no application path can bypass them.

## Account types

Phase 2A defines Deposit Clearing, User Principal, Bull Vault, Spot Treasury/Strategy, Futures Treasury/Strategy, Reward Vault/Payable, Withdrawal Buffer, Ecosystem Fund, Platform Treasury, Fee Expense, Trading PnL and Funding Expense.

## Idempotent deposit allocation

Deposit and LedgerTransaction each have unique idempotency keys. FundAllocation is unique by `(depositId, fundDomain)`. The allocation service runs under a Serializable database transaction, writes both journals, stores the three allocation snapshots, creates Principal XP and marks the deposit complete atomically.

## Baseline

Before Phase 2A changes, on 2026-09-22, all five Phase 1 packages passed `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration`. Those tests remain in the suite.
