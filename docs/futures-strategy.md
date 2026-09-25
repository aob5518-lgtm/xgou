# Futures Trend V1

`FUTURES_TREND_V1` is an aggregate, one-way-mode paper strategy for `BTC/USDC-PERP`, `ETH/USDC-PERP`, and `SOL/USDC-PERP`. Source pairs are recorded as `BTCUSDT`, `ETHUSDT`, and `SOLUSDT` perpetual markets.

The signal pipeline uses public OHLCV, mark/index prices, funding, and open interest. CI and local tests use deterministic fixtures; no account endpoint or API credential is supported. EMA20/50/100 alignment, 20-period momentum, trend strength, RSI14, ATR14, volatility, funding, and liquidity determine `LONG`, `SHORT`, or `HOLD`. A position exits on its mandatory stop or an EMA20/EMA50 trend break.

Every entry has an ATR stop. The default stop, target, and trailing distances are 2 ATR, 4 ATR, and 2 ATR. A LONG trailing stop can only rise; a SHORT trailing stop can only fall. Position flips are forbidden: the current position must close in one cycle before the opposite side can open in a later cycle.

The strategy is disabled by default. Enable a paper worker explicitly with `FUTURES_PAPER_TRADING_ENABLED=true`. Its distributed lock is `xgou:futures-agent:cycle-lock`, separate from Spot. Cycle IDs use `FUTURES_TREND_V1:<minuteBucket>` and database uniqueness prevents duplicate cycles.

## Capital boundary

Paper capital mirrors the internal `futures-treasury:USDC` balance. At the default 35% reserve ratio, 2,000 USDC is represented as 700 reserve plus 1,300 active capital. This does not post ledger entries and does not move vault funds.

**NO REAL FUNDS MOVE. No reward is generated from paper PnL.**
