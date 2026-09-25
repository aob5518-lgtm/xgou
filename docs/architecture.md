# XGOU Architecture

## Target fund and reward flow

```mermaid
flowchart TD
  U[User] --> ADR[Arc Deposit Router]
  ADR --> DC[Deposit Clearing]
  DC -->|50%| BV[Bull Master Vault]
  DC -->|30%| ST[Spot Strategy Treasury]
  DC -->|20%| FT[Futures Strategy Treasury]

  BV --> BP[Bull Portfolio]
  ST --> SR[Spot Reserve]
  ST --> SP[Spot Strategy Pods]
  SP --> SA[Spot CEX Subaccounts / Onchain DEX]
  FT --> FR[Futures Reserve]
  FT --> FP[Futures Trend Pods]
  FP --> FA[Futures CEX Subaccounts]

  SA --> SPNL[Spot Realized Net PnL]
  FA --> FPNL[Futures Realized Net PnL]
  SPNL --> GNAV[Global Agent NAV]
  FPNL --> GNAV
  GNAV --> HWM[High Water Mark]
  HWM --> LC[Loss Carryforward]
  LC --> DP[Distributable Profit]
  DP --> RPV[Weekly Reward Pool / Reward Vault]
  RPV --> XP[XP Snapshot]
  XP --> UR[User Reward]
  UR --> WB[Withdrawal Buffer]
  WB -->|95% default| USER[User]
  WB -->|5% configurable| EV[Ecosystem Vault]

  PT[Platform Operating Treasury]:::isolated
  BV -. no automatic transfer .- ST
  ST -. no automatic transfer .- FT
  BV -. strictly isolated .- PT
  ST -. strictly isolated .- PT
  FT -. strictly isolated .- PT
  classDef isolated fill:#541c1c,stroke:#ff6b6b,color:#fff
```

Platform Treasury 与 Bull、Spot、Futures、Reward、Withdrawal Buffer、Ecosystem 资金域完全隔离。交易 Agent 只能提交 proposal；Treasury allocation、withdrawal 和跨域 rebalance 不属于 Agent 权限。

## Current Phase 2A runtime

```mermaid
flowchart LR
  W[Wallet / SIWE] --> A[NestJS API]
  A --> D[Deposit Intent]
  C[Confirmed Deposit Event] --> F[Fund Allocation Service]
  CFG[Versioned System Config] -->|50 / 30 / 20| F
  F --> LJ[Double-entry Journal Builder]
  LJ --> LT[(LedgerTransaction)]
  LT --> LE[(Immutable LedgerEntry)]
  LE --> BA[Balance Reconstruction]
  F --> FA[(FundAllocation Snapshot)]
  F --> P[(Participation + Principal XP)]
  A --> R[Referral / XP Services]
  CFG --> R
  A --> AL[(Append-only Audit Log)]
```

### Boundaries

- PostgreSQL LedgerEntry 是余额事实来源；Redis 不保存最终余额。
- 一笔确认入金生成 `DEPOSIT_CONFIRMATION` 和 `FUND_ALLOCATION` 两个平衡 Journal。
- Bull、Spot、Futures 账户类型与 `fundDomain` 在领域层和数据库约束层同时校验。
- 用户只能创建 Deposit intent，不能自行把状态改为 confirmed 或触发伪造链上入账。
- 所有分配保存生效的 System Config version，以便审计、重放与争议处理。
- XP 规则保持 Phase 1 原样；有效入金完成分配后才生成 Participation 与 Principal XP。

## Planned boundaries

Phase 2B 增加 Arc Chain Registry、finality adapter 和 Vault contracts。Phase 3 增加隔离的 Spot/Futures Paper accounts、risk engine 和 execution adapters。Phase 4 增加 NAV、High Water Mark、Loss Carryforward、Reward Pool 和提现费。未完成模块不会用占位接口伪装成可用功能。
# Phase 3B futures paper pipeline

```text
FuturesVault (read-only reference)
  -> Ledger Futures Capital (read-only mirror)
  -> Paper Futures Strategy Account
  -> Public / Fixture Market Data
  -> FUTURES_TREND_V1 Signal
  -> Futures Risk Engine
  -> Paper Perp Execution
  -> Margin / One-way Position
  -> MTM / Funding
  -> Futures NAV / Circuit

NO REAL FUNDS MOVE
```

Spot and Futures use separate accounts, positions, baselines, circuit state, cycle IDs, and Redis locks. Paper performance is illustrative and is excluded from real Ledger balances, Dashboard total assets, and Rewards.
