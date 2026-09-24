# Phase 2B contracts

`DepositRouter` is the only user-facing write surface. It accepts the official Arc Testnet USDC ERC-20 interface, rejects unsupported assets, derives a deterministic deposit ID, rejects duplicate `(user, clientReference)` pairs, and routes the amount with BPS arithmetic. The final Futures amount receives the integer remainder, preserving exact conservation.

`BullVault`, `SpotStrategyVault`, and `FuturesStrategyVault` are three independent addresses. They hold Testnet USDC only; no strategy, exchange, leverage, reward, or withdrawal behavior is present in Phase 2B.

Each vault and the router use OpenZeppelin `AccessControl`, `Pausable`, `ReentrancyGuard`, and `SafeERC20`. Router deposits require `ROUTER_ROLE`; treasury withdrawals require `TREASURY_ROLE`; pause controls require `PAUSER_ROLE`; allocation changes require `ALLOCATOR_ROLE` and must total exactly 10,000 BPS. There is no proxy or upgradeability layer.

The emitted `DepositAllocated` event is the source event for the backend indexer. The indexer persists raw payloads, matches the pre-created intent, and only then invokes the existing double-entry ledger and Principal XP flow. The deployment registry under `packages/contracts/deployments/arc-testnet.json` is intentionally marked `deployed: false` until a testnet deployer secret is provided; no address is fabricated.
