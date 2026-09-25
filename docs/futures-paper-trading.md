# Futures paper trading safety

Phase 3B supports paper execution only. `PaperPerpExchangeAdapter` models market fills, direction-aware slippage, taker fees, weighted-average entries, partial reductions, funding, stops, and liquidations.

`LivePerpExchangeAdapter` always throws `Phase 3B paper only`; it has no authenticated transport. The runtime contains no private exchange API, signing code, withdrawal, bridge, DEX, token approval, or `FuturesVault` write. `REAL_TRADING_ENABLED=false`, `REAL_WITHDRAWALS_ENABLED=false`, and `MAINNET_ENABLED=false` remain mandatory.

Funding uses a fixed eight-hour bucket in fixture mode. Its unique idempotency key is `<positionId>:<fundingBucket>`, so replay/restart cannot charge twice. A unique strategy/cycle ID likewise prevents duplicate signals, orders, fills, or position mutations. Positions, stops, trailing extremes, margin, funding, NAV/HWM/baselines, consecutive losses, and circuit state are stored in PostgreSQL for restart recovery.

The read API is `GET /v1/agent/futures`. Admin and Risk Manager controls are `POST /v1/admin/agent/futures/pause`, `/risk-off`, and `/resume`. Every response and UI panel labels values `PAPER`; Dashboard real total assets and Rewards do not include paper Futures performance.
