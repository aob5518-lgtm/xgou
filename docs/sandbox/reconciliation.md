# Sandbox reconciliation

REST is authoritative for Binance sandbox balances, open orders, trades, Spot holdings, Futures positions, and funding. Internal state is compared to independently captured exchange snapshots. Any unexplained order, fill, position, or material balance mismatch is critical and disables sandbox transport, persists the global emergency stop, emits an alert, and opens an incident.

An apparent Binance Testnet data reset is recorded as `TESTNET_ENVIRONMENT_RESET` suspected. It never changes the principal ledger, Reward Pool, or production readiness.
