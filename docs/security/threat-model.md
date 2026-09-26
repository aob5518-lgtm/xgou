# Threat Model

| Threat | Prevent | Detect | Respond | Recover |
|---|---|---|---|---|
| Private key theft | managed signer handles, no raw keys | provider health/security alert | emergency stop, revoke reference | rotate and reconcile |
| API key compromise | trade-only/no withdrawal | auth failures, anomaly metrics | disable profile | rotate credential |
| Malicious admin | RBAC, multi-approval, no self-approval | immutable audit | revoke role, incident | independent review |
| Compromised Agent | no keys/roles, policy boundary | proposal anomalies | pause strategy/global state | redeploy and replay audit |
| Strategy bug | double risk barrier, limits | rejection/loss metrics | reduce-only | corrected version with approval |
| Market manipulation | primary/secondary price check | deviation alert | block orders | trusted feed restoration |
| Exchange outage/insolvency | health gate, exposure limits | latency/error/reconciliation | pause, cancel/reduce | reconcile and migrate safely |
| Replay/duplicate order | stable clientOrderId, unique DB key | duplicate metric/audit | no resubmit | query canonical order |
| DB tampering | restricted access, audit, backups | reconciliation/audit gaps | stop trading | verified restore |
| Redis loss | never source of truth | worker health | restart workers | rebuild from Postgres |
| Contract admin compromise | role separation/multisig | chain monitoring | pause and revoke | governed migration |
| Withdrawal abuse | trading key cannot withdraw | permission scanner | fail readiness, incident | rotate and investigate |
