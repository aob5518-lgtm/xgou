# Futures paper risk controls

Every open/increase and every reduce/exit persists a `RiskDecision`. Entries without a stop are rejected.

Default controls:

- max leverage: 3×
- max loss at stop: 2% of Futures equity
- single-asset exposure: 20%
- gross exposure: 65%
- absolute net exposure: 50%
- margin usage: 50%
- minimum liquidation distance: 20%
- daily loss: 2%
- weekly loss: 5%
- maximum drawdown: 15%
- consecutive losses: 3

An oversized proposal is reduced to the tightest compatible risk limit when possible. Stale data, extreme funding, excessive volatility/slippage, missing stop, or a circuit prohibition causes rejection. `REDUCED_RISK` caps both leverage and notional; `PAUSED` and `RISK_OFF` forbid exposure increases while permitting reduce-only and close actions.

`RISK_OFF` persists across restarts and only an Admin or Risk Manager may resume it. A data-feed pause may safely recover through the recorded circuit transition path. All manual and automatic state changes create audit/risk records.
