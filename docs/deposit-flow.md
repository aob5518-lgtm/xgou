# Phase 2B deposit flow

```mermaid
sequenceDiagram
  participant W as Wallet
  participant F as Frontend
  participant A as API
  participant U as Arc USDC
  participant R as DepositRouter
  participant V as Bull / Spot / Futures Vaults
  participant I as DepositIndexer
  participant L as Double-entry Ledger
  participant X as Principal XP
  participant D as Dashboard

  W->>F: Connect and switch to Arc Testnet
  F->>A: SIWE nonce / verify
  F->>A: Create Deposit Intent (clientReference)
  F->>U: approve exact participation amount to Router
  F->>R: deposit(USDC, amount, clientReference)
  R->>U: transferFrom user
  R->>V: route 50 / 30 / 20 BPS
  R-->>I: DepositAllocated event
  F->>A: Submit transaction hash (never confirmation)
  I->>I: Scan finalized Arc blocks from persisted cursor
  I->>A: Match router, asset, wallet, amount, clientReference
  A->>L: Confirmation + 50/30/20 journals
  A->>X: Create Principal XP after ledger allocation
  D->>A: Read completed Testnet ledger data
```

Arc deterministic finality means the indexer does not wait for an Ethereum-style confirmation count. It still uses a persisted block cursor and a unique `(chainId, txHash, logIndex)` event key so a replay is safe. A frontend-supplied transaction hash only moves a deposit to `TX_SUBMITTED`; only the matched event can move it to `CHAIN_CONFIRMED` and then `COMPLETED`.
