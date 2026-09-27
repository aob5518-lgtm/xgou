# Binance USDⓈ-M Futures Testnet

The Futures sandbox adapter uses only `https://demo-fapi.binance.com`. It supports time, exchange metadata, account, one-way position mode, positions, orders, trades, funding income, isolated margin, and leverage limited to 2×.

Every exposure-increasing order requires a protective stop. If stop placement fails, the adapter immediately attempts a reduce-only close; if the close is not confirmed it invokes the critical incident callback so the runtime can persist `EMERGENCY_STOP`. High-leverage liquidation testing is prohibited.
