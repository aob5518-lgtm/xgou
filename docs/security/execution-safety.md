# Execution Safety

The fixed path is Strategy → Proposal → Strategy Risk → Execution Authorization → fresh Pre-Trade Risk → Adapter → Credential Provider. Authorization expires after 30 seconds and is invalidated by excessive price drift. Global Kill Switch outranks strategy circuits. `REDUCE_ONLY` and `EMERGENCY_STOP` reject exposure increases while permitting reduce/close safety actions. Emergency recovery is manual.

Every order uses `xgou:<strategy>:<cycle>:<proposal>`. Duplicate IDs return the same dry-run execution. Timeouts become `UNKNOWN`, never an automatic resubmit. Trading ledger posting is a separate boundary and Phase 5 does not modify the Principal Ledger.
