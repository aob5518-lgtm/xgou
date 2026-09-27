# Binance sandbox reconciliation

Compare independently persisted internal balances, orders, fills, Spot positions, Futures positions, and funding records with REST snapshots. Store every run and difference. Dust stays informational; unexplained order, fill, or position mismatches are critical. A critical difference must disable `SandboxTransportControl`, persist `EMERGENCY_STOP`, emit an alert, and create an incident. Resume requires manual reconciliation and a new approval.
