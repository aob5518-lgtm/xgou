# Backup and Recovery

Postgres is the source of truth for ledger, positions, reward snapshots, execution state, approvals, incidents, and audit. Backups must be encrypted, access-controlled, retained under policy, and restore-tested. Deployment manifests and reviewed configuration are versioned separately. Redis is ephemeral coordination only: it must never be the source of truth for ledger, positions, rewards, authorization, or credentials.

## Restore verification checklist

1. Restore the latest full Postgres backup into an isolated environment.
2. Apply all migrations with a frozen release artifact.
3. Verify ledger balance constraints, latest chain cursor, positions, reward epochs, open incidents, and immutable audit continuity.
4. Start workers with trading disabled and reconstruct queues/runtime state from Postgres.
5. Reconcile on-chain vaults and fixture exchange balances before any resume decision.
6. Confirm Redis loss and recreation does not change business state.
7. Record recovery point, recovery duration, approvers, discrepancies, and remediation.

Spot, Futures, Reward, and Global Risk workers must recover exclusively from database state. A production enable gate requires a completed restore drill.
