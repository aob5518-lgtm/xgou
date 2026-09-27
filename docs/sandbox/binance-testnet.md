# Binance Testnet execution

Phase 6 connects XGOU only to Binance test environments. Spot uses `https://testnet.binance.vision/api`; USDⓈ-M Futures uses `https://demo-fapi.binance.com`. These hosts are pinned in code and production hosts are rejected before any request is constructed.

Network order submission requires all of the following:

- `EXECUTION_MODE=SANDBOX`
- `SANDBOX_EXCHANGE_TRANSPORT_ENABLED=true`
- `BINANCE_ENVIRONMENT=TESTNET`
- enabled `SandboxTransportControl` backed by an approved, unexpired two-person `ApprovalRequest`
- active Spot and Futures `ExchangeCredentialProfile` rows containing opaque provider references only
- trade-only permissions (`READ + SPOT_TRADE` or `READ + FUTURES_TRADE`), never `WITHDRAW`
- global risk state `ACTIVE`, no unresolved critical incident, and no UNKNOWN order backlog

The normal CI workflow never contacts Binance. Real Testnet tests are isolated in the manually dispatched `Binance Sandbox E2E` workflow and protected by the `binance-testnet` GitHub environment. Forks and non-main refs cannot execute it.

## Execution guarantees

Every sandbox order is reserved in `SandboxOrder` before transport. `internalClientOrderId` and Binance's 36-character `exchangeClientOrderId` are both unique. A timeout or HTTP 5xx after a write is `UNKNOWN`; the write is never retried and recovery queries by client order ID. REST account/order/trade/position queries are the source of truth. WebSocket support may improve latency later but cannot finalize accounting.

Prices and quantities are rounded down using live `exchangeInfo` filters. Futures uses one-way mode, isolated margin where supported, no more than 2× leverage, and requires a protective stop for any exposure-increasing order. Testnet balances are labelled `TEST FUNDS · NO REAL ASSETS`.

No withdrawal or transfer endpoint exists. `LIVE_EXCHANGE_TRANSPORT_ENABLED`, `REAL_TRADING_ENABLED`, `REAL_WITHDRAWALS_ENABLED`, `REAL_REWARD_DISTRIBUTION_ENABLED`, and `MAINNET_ENABLED` stay false.

## Credential references

Use separate references:

- `vault://exchange/binance-testnet/spot`
- `vault://exchange/binance-testnet/futures`

Secrets exist only during `CredentialHandle.use()`. They must never be stored in PostgreSQL, Redis, logs, audit events, browser variables, or error bodies.

## API surface

Authorized ADMIN/RISK_MANAGER endpoints are under `/v1/admin/sandbox/binance`:

- `GET /readiness`, `/orders`, `/reconciliation`, `/recovery`
- `POST /enable/request`, `/enable`, `/disable`, `/emergency-stop`

There is deliberately no manual order endpoint and no user-facing direct order route.
