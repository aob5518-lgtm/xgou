# Exchange Security

Exchange credentials are referenced, never stored. Production keys must be trade-only and must not grant withdrawal. A withdrawal permission, expired credential, unhealthy provider, excessive clock drift, unhealthy exchange, or unresolved unknown order fails the execution gate. Reads may use bounded retry. Order submission is never blindly retried; a lost response produces `UNKNOWN` and recovery queries by `clientOrderId`.

Phase 5 adapters serialize and validate orders but cannot send them. `LIVE_EXCHANGE_TRANSPORT_ENABLED=true` fails startup.
