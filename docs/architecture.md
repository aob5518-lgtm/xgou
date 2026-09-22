# XGOU Architecture

## Target fund flow

```mermaid
flowchart TD
  U[User] --> DR[Deposit Router]
  DR -->|50%| BV[Bull Master Vault]
  DR -->|50%| AV[Agent Master Vault]
  AV --> LR[Liquidity Reserve]
  AV --> PA[Strategy Pod A]
  AV --> PB[Strategy Pod B]
  AV --> PC[Strategy Pod C]
  PA --> CA[CEX Subaccount A]
  PB --> CB[CEX Subaccount B]
  PC --> OW[Onchain Smart Account / MPC Wallet]
  CA --> PNL[Realized Net PnL]
  CB --> PNL
  OW --> PNL
  PNL --> WR[Weekly Reward Pool / Reward Vault]
  WR --> XP[XP Snapshot Distribution]
  XP --> RB[Reward Balance]
  RB --> WB[Withdrawal Buffer]
  WB -->|95% default| USER[User]
  WB -->|5% configurable| EF[Ecosystem Vault]
  PT[Platform Operating Treasury]:::isolated
  BV -. strictly isolated .- PT
  AV -. strictly isolated .- PT
  classDef isolated fill:#541c1c,stroke:#ff6b6b,color:#fff
```

Platform Operating Treasury 与 User Bull Assets、User Agent Assets、Strategy Pods、Reward Vault、Withdrawal Buffer 和 Ecosystem Vault 在法律实体、账户、账本与权限上均须隔离。上图是目标架构；Phase 1 只实现下面的 identity/referral/XP control plane。

## Phase 1 runtime

```mermaid
flowchart LR
  W[Wallet] -->|EIP-4361 signature| A[NestJS API]
  A --> N[Nonce + Rotating Sessions]
  A --> R[Referral Service]
  R --> C[(Referral Closure Table)]
  A --> X[XP Service]
  X --> E[Decimal XP Engine]
  C --> X
  X --> P[(Principal XP Entries)]
  A --> L[(Append-only Audit Log)]
  N --> DB[(PostgreSQL)]
  C --> DB
  P --> DB
```

### Boundaries

- Controllers validate transport input and authenticate callers; domain rules stay in engine/service packages.
- PostgreSQL is the source of truth. Redis is reserved for queues, locks, rate limit and cache—not balances.
- Referral writes are serializable. The closure table stores self rows at depth 0 and ancestors at positive depth.
- XP queries aggregate immutable Principal XP entries. Dynamic XP is calculated once from qualifying depths and is never recursively reused.
- Versioned `SystemConfigVersion` rows make every threshold and rate reproducible for future epoch snapshots.

## Planned module boundary

Future phases add `ledger`, `contracts`, `risk-engine`, `strategy-engine`, `exchange-adapters`, `wallet-adapters`, `agent-core`, `worker`, `web` and `admin` as separate packages/apps. External exchanges, chains, wallets and AI providers enter only through interfaces; sandbox adapters remain the default until an explicit production readiness gate is satisfied.
