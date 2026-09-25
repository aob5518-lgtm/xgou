# Futures paper margin model

Phase 3B uses a deterministic isolated paper-margin model, not an attempt to reproduce any exchange liquidation engine.

For quantity `q`, mark `m`, entry `e`, leverage `L`, maintenance ratio `MMR`, and liquidation fee buffer `F`:

- notional = `q × m`
- initial margin = `notional / L`
- maintenance margin = `notional × MMR`
- LONG unrealized PnL = `q × (m - e)`
- SHORT unrealized PnL = `q × (e - m)`
- LONG liquidation price = `e × (1 - 1/L + MMR + F)`
- SHORT liquidation price = `e × (1 + 1/L - MMR - F)`
- liquidation distance = `abs(mark - liquidationPrice) / mark`

The default MMR is 1%, the liquidation penalty is 50 bps, and the required projected liquidation distance is at least 20%. New risk is rejected or reduced before it violates the limit. A paper position that nevertheless crosses its liquidation price because of a market gap is closed, charged the configured penalty, emits a CRITICAL risk event, and permanently enters `RISK_OFF` until an Admin or Risk Manager resumes it.

Available margin is active cash less used initial margin. Margin usage is used initial margin divided by equity. Spot, Bull, and user wallet balances never collateralize Futures.

NAV is `active paper cash + reserve + unrealized PnL`. Active cash begins at active capital and subsequently reflects realized PnL, funding, and fees exactly once. Reserve is not available as order margin.
