# Fund Architecture

## Capital domains

Every confirmed participation is routed once from Deposit Clearing:

| Domain | Default | Destination | Automated consumers |
| --- | ---: | --- | --- |
| Bull | 50% | Bull Master Vault | Approved Bull portfolio execution only |
| Spot | 30% | Spot Strategy Treasury | Spot Strategy Pods only |
| Futures | 20% | Futures Strategy Treasury | Futures Trend Pods only |

The ratios are Decimal strings in a versioned System Config. Their exact sum must be `1.00`; otherwise configuration loading and allocation both fail closed.

## Isolation rules

- Deposit Clearing temporarily receives confirmed principal and returns to zero after allocation.
- Bull cannot fund Spot or Futures automatically.
- Spot cannot be used as Futures margin.
- Futures cannot be consumed by Spot orders.
- Reward Vault, Withdrawal Buffer, Ecosystem Fund and Platform Treasury have separate ledger account types and domains.
- Platform operating costs can never draw against user principal accounts.
- A future cross-domain Treasury Rebalance requires a dedicated operation, administrator approval and audit event.

## 10,000 USDC example

The confirmation journal debits Deposit Clearing 10,000 and credits User Principal 10,000. The allocation journal credits Deposit Clearing 10,000 and debits Bull 5,000, Spot 3,000 and Futures 2,000. Both journals independently balance; Deposit Clearing's derived net balance returns to zero.

Token display decimals and ledger precision are different concepts. The ledger stores `Decimal(36,18)`; a Money value also carries its token decimals and chain identifier so Phase 2B can convert at the adapter boundary without hardcoded assumptions.
