# Binance UNKNOWN order recovery

Never resubmit a timed-out POST. Mark the persisted order `UNKNOWN`, stop new exposure when the configured backlog is reached, then query REST by `exchangeClientOrderId`. Import trades idempotently by exchange trade ID and advance the state only from authoritative REST data. If no order is found after the bounded recovery window, mark `RECONCILIATION_REQUIRED`, disable sandbox transport, open a critical incident, and require manual resolution.
