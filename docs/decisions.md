# Engineering Decisions

## ADR-001 — PostgreSQL closure table for referrals

Selected over recursive reads and materialized paths. Binding is rare while XP reads and snapshots are frequent. A serializable transaction copies the inviter's ancestor rows with `depth + 1`, enabling indexed, bounded queries and deterministic cycle detection.

## ADR-002 — Decimal strings at boundaries

Database amounts are `Decimal(36,18)`. Domain functions accept Decimal-compatible values and API responses serialize amounts as strings. Native JavaScript `number` is never used for asset or XP arithmetic.

## ADR-003 — SIWE plus rotating server sessions

An address alone proves no control. Nonces expire after five minutes, are hashed at rest and consumed atomically. Access tokens last 15 minutes. Refresh tokens are hashed in PostgreSQL, rotated on every refresh, revocable, and transported only in scoped HttpOnly cookies with a double-submit CSRF token.

## ADR-004 — Inviter binding precedes participation

The inviter is optional until a user's first participation. Afterwards it cannot be added or changed. This removes retroactive network manipulation. Self-referral, descendant-to-ancestor cycles and concurrent rebinds are rejected.

## ADR-005 — Config versions instead of scattered constants

Business defaults live in a typed shared contract and are persisted as immutable versions with `effectiveAt`. Future reward epochs will reference the effective config version so historical computation remains replayable.

## ADR-006 — No fake future-phase modules

Only completed phases are exposed. Arc contracts, strategies, risk execution and UI remain absent until their own acceptance gates pass; they are not represented by incomplete endpoints.

## ADR-007 — Toolchain compatibility

TypeScript is pinned to the newest stable major supported by the strict `typescript-eslint` toolchain used here. Prisma is pinned to stable 7.10 instead of a prerelease major. Exact resolution remains reproducible through `pnpm-lock.yaml`.

## ADR-008 — 50/30/20 is a versioned, exact invariant

Bull/Spot/Futures allocation ratios are Decimal strings and must sum to exactly `1.00`. The System Config schema, allocation engine and tests all reject under-allocation and over-allocation. Each FundAllocation stores the config version used at posting time.

## ADR-009 — LedgerEntry is the balance source of truth

Accounts intentionally contain no mutable balance column. A deposit confirmation and its fund allocation are separate balanced journals. PostgreSQL deferred triggers validate debit equals credit per asset at commit, and posted transactions/entries are append-only. Corrections use explicit reversal transactions.

## ADR-010 — Fund domains are structural permissions

Bull, Spot and Futures are not labels on a shared account. Account types, domain fields, seed provisioning, journal construction and SQL constraints agree on the allowed domain. Cross-domain transfers require a future audited Treasury Rebalance workflow and cannot be initiated by a strategy agent.

## ADR-011 — Deposit intent is not deposit confirmation

The authenticated user may create an idempotent deposit intent, but cannot confirm it. Confirmation will be produced by the Phase 2B chain/finality adapter. Only a confirmed deposit can enter the internal allocation service.

## ADR-012 — Frontend preview is provider-driven and safe by construction

Phase 2.5 uses a typed `XgouDataProvider` with Demo as the default implementation. Financial preview math uses Decimal. Wallet connection is address display only; the web application exposes no transaction-writing path.

This allows product experience review and Vercel deployment while Arc contracts, authenticated read APIs, execution adapters and real settlement remain unavailable. A polished preview must never be mistaken for live financial infrastructure.
