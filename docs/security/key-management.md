# Key Management

`KeyProvider` returns only short-lived signer handles and signature results. Raw private-key APIs are prohibited. `CredentialProvider` resolves `kms://`, `vault://`, or `custody://` references to opaque, non-serializable, process-local handles. Secrets never enter Postgres, Redis, logs, audit, error messages, frontend variables, or source control.

Phase 5 provides Disabled, Mock, and LocalDev providers only. LocalDev and Mock providers fail startup in production. AWS KMS, GCP KMS, HSM, MPC, and Custody remain integration boundaries for a later controlled phase.
