# Binance testnet credential revocation

Disable sandbox transport first, then revoke the Binance Testnet API key and mark the matching `ExchangeCredentialProfile` disabled. Do not delete audit records. Rotate the provider secret, verify the replacement has only READ plus its account-specific trade permission, and repeat readiness and protected E2E checks. Any unexpected permission or authentication failure is a security event and blocks restart.
