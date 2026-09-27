# Sandbox order recovery

Binance HTTP 5xx, `-1007`, aborts, and transport loss after a write mean `UNKNOWN`, never “failed.” The same write must not be retried. Recovery queries REST using the persisted exchange client order ID, imports fills idempotently by exchange trade ID, and advances the persisted state. Unresolved orders become `RECONCILIATION_REQUIRED` and block new exposure.
