# Secrets Policy

Only references such as `kms://xgou/prod/treasury-executor`, `vault://exchange/binance/spot`, and `custody://provider/account/123` may be persisted. Production secret values, seed phrases, raw key-shaped hex, bearer tokens, API secrets, SIWE signatures, cookies, and refresh/access tokens are prohibited in code, database, Redis, logs, audit, monitoring payloads, errors, and `NEXT_PUBLIC_*` variables. `.env.example` contains names and safe placeholders only. CI runs local static secret and dangerous-call scanners.
