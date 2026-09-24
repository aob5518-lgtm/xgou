# Phase 2B contracts

`DepositRouter` is the only user-facing write surface. It accepts the official Arc Testnet USDC ERC-20 interface, rejects unsupported assets, derives a deterministic deposit ID, rejects duplicate `(user, clientReference)` pairs, and routes the amount with BPS arithmetic. The final Futures amount receives the integer remainder, preserving exact conservation.

`BullVault`, `SpotStrategyVault`, and `FuturesStrategyVault` are three independent addresses. They hold Testnet USDC only; no strategy, exchange, leverage, reward, or withdrawal behavior is present in Phase 2B.

Each vault and the router use OpenZeppelin `AccessControl`, `Pausable`, `ReentrancyGuard`, and `SafeERC20`. Router deposits require `ROUTER_ROLE`; treasury withdrawals require `TREASURY_ROLE`; pause controls require `PAUSER_ROLE`; allocation changes require `ALLOCATOR_ROLE` and must total exactly 10,000 BPS. There is no proxy or upgradeability layer.

The emitted `DepositAllocated` event is the source event for the backend indexer. The indexer persists raw payloads, matches the pre-created intent, and only then invokes the existing double-entry ledger and Principal XP flow. The deployment registry under `packages/contracts/deployments/arc-testnet.json` is intentionally marked `deployed: false` until a testnet deployer secret is provided; no address is fabricated.

Before ledger posting, the indexer loads the SystemConfig version locked onto the Deposit intent and recomputes Bull, Spot, and Futures amounts in ERC-20 minimum units. A merely conserved but incorrect split such as 40/40/20 is rejected before Participation or Principal XP creation. The event is marked `REVIEW`, the Deposit is failed, a RiskFlag and CRITICAL reconciliation differences are created, and DepositSafety blocks new deposits.

## Testnet role ownership

The deployment script enforces this initial Testnet role layout:

| Contract | Role | Holder after deployment |
| --- | --- | --- |
| DepositRouter | `DEFAULT_ADMIN_ROLE` | deployer EOA |
| DepositRouter | `ALLOCATOR_ROLE` | deployer EOA |
| DepositRouter | `PAUSER_ROLE` | deployer EOA |
| Each vault | `DEFAULT_ADMIN_ROLE` | deployer EOA |
| Each vault | `TREASURY_ROLE` | deployer EOA |
| Each vault | `PAUSER_ROLE` | deployer EOA |
| Each vault | `ROUTER_ROLE` | DepositRouter |

This explicitly means the deployer controls Testnet treasury withdrawals. Mainnet must transfer Admin, Treasury, Allocator, and Pauser authority to approved multisig/timelock governance and revoke the deployer EOA. Long-lived deployer EOA authority is forbidden on mainnet.

## Automated reconciliation

With `RECONCILIATION_ENABLED=true`, the API runs reconciliation at startup and every `RECONCILIATION_INTERVAL_MS` (120,000 ms by default). Every attempt creates a `ReconciliationRun` containing its timestamps, Arc chain ID, internal and external balances for all three domains, critical count, status, and any sanitized error. Differences above `RECONCILIATION_DUST_THRESHOLD` are `CRITICAL` and automatically pause new Deposit intents through `DepositSafetyService`.
