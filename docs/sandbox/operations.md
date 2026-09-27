# Binance sandbox operations

Startup, enablement, recovery, reconciliation, credential rotation, and shutdown procedures are defined in the Binance runbooks. Operators use only `/v1/admin/sandbox/binance/*`; no direct order endpoint exists. The UI must always say `SANDBOX TESTNET` and `TEST FUNDS · NO REAL ASSETS`, never `LIVE`.

Normal CI uses mocked transports. Authenticated E2E runs only through the manually dispatched, main-branch-only workflow protected by the `binance-testnet` GitHub Environment and finishes by cancelling open orders and closing positions.
