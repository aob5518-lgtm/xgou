# Binance Spot Testnet

The Spot sandbox adapter uses only `https://testnet.binance.vision/api`. It supports server time, exchange metadata, account balances, market orders, query/cancel by client order ID, open orders, and trades. It consumes live symbol filters, rounds down with Decimal, persists an order before submission, and never retries a write whose outcome is unknown.

Credentials require only `READ` and `SPOT_TRADE`. Withdrawal and transfer paths are rejected at the HTTP boundary. Test assets are isolated from XGOU principal, treasury, reward, and dashboard accounting.
