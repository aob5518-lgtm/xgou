# Binance sandbox startup

1. Confirm all real-money flags and production transport are false.
2. Confirm the two trade-only CredentialProvider references resolve and contain no withdrawal permission.
3. Run public server-time and exchange-info checks, then verify clock drift is at most 1 second.
4. Confirm Futures account uses one-way mode and the configured maximum leverage is 2×.
5. Create and independently approve `ENABLE_BINANCE_SANDBOX_TRANSPORT`; enable the database control only after approval.
6. Confirm `/v1/admin/sandbox/binance/readiness` reports ready before starting workers.
7. Run the protected E2E workflow and confirm its cleanup leaves no Spot orders or Futures positions.
