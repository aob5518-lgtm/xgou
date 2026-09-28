# XGOU V1 release checklist

Last updated: 2026-09-28. V1 is Arc Testnet plus Paper strategies. Production trading, mainnet, real withdrawals and real reward distribution remain disabled.

| Check | Status | Evidence |
| --- | --- | --- |
| Wallet connect and network switch | PASS | Wagmi injected/WalletConnect UI, Arc Testnet chain registry |
| SIWE login, refresh and logout | PASS | Nonce replay protection, signed login, rotating refresh session and CSRF-protected refresh/logout |
| Referral binding | PASS | Permanent edge, self/cycle/existing-inviter protections and 31-level boundary tests |
| Deposit intent | PASS | Authenticated idempotent `POST /v1/funds/deposits` |
| USDC approve | PASS | Exact-amount allowance check and receipt wait in Join flow |
| Arc Testnet deposit | PASS | 10 USDC tx `0x362328fc8b7de60a762a0541ba3556e41fe4bf4b2ff05e4614c501775989db55` |
| Indexer | PASS | Block 63786121, log index 30 |
| 50/30/20 allocation | PASS | 5 / 3 / 2 USDC for the acceptance deposit |
| Ledger and reconciliation | PASS | Zero difference across all three domains |
| Principal XP | PASS | +10 XP for the acceptance deposit |
| Dashboard real API | PASS | User-scoped ledger principal, allocations, XP, deposit, agent and reward status |
| Bull page real API | PASS | User allocation, deposit history, registry address and Arc balance evidence |
| Spot Paper API | PASS | DB-backed snapshot; empty state when no cycle exists |
| Futures Paper API | PASS | DB-backed snapshot; empty state when no cycle exists |
| XP and referral API | PASS | Live XP, qualification, inviter and 30-level tree |
| Activity API | PASS | Latest 50 Deposit, Allocation, XP, Agent and Paper Reward events |
| Paper Rewards API | PASS | Frozen finalized epochs only; empty state otherwise |
| No Demo leakage in TESTNET | PASS | API failure throws typed error; automated provider regression test |
| Loading, empty and error states | PASS | Route loading/error boundary and reusable states |
| All nine routes | PASS | Build-time generation plus deployment HTTP acceptance |
| Mobile Join sanity | PASS | 375px-safe grids, wrapping hashes, full-width amount control |
| Security gates | PASS | Mainnet, live trading, withdrawals and real reward distribution disabled |
| Binance authenticated E2E | N/A | External credentials not configured; not a V1 blocker |
| External audit / production KMS / multisig | N/A | Production Readiness intentionally remains FAIL |

## Release decision

The implementation and previously recorded Arc Testnet acceptance satisfy the V1 code and chain invariants. A final browser acceptance of the newly deployed TESTNET-mode frontend against a publicly reachable API is required before changing the release label to `XGOU V1 COMPLETE`.
