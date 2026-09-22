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

## ADR-006 — No fake Phase 2+ modules

Only Phase 1 is implemented in this delivery. Ledger, deposits, contracts, strategies and UI are intentionally absent rather than represented by incomplete interfaces or misleading endpoints. Their target boundaries are documented so later phases can be added without rewriting identity, referrals or XP.

## ADR-007 — Toolchain compatibility

TypeScript is pinned to the newest stable major supported by the strict `typescript-eslint` toolchain used here. Prisma is pinned to stable 7.10 instead of a prerelease major. Exact resolution remains reproducible through `pnpm-lock.yaml`.
