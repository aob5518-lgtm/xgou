# Arc network registry

Verified on **2026-09-24** against Arc's official documentation and public JSON-RPC. Phase 2B is **Arc Testnet only**; mainnet remains disabled in `@xgou/chains`.

| Parameter | Arc Testnet value |
| --- | --- |
| Network type | EVM-compatible testnet |
| Chain ID | `5042002` (`0x4cef52`) |
| HTTP RPC | `https://rpc.testnet.arc.io` |
| WebSocket RPC | `wss://rpc.testnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` |
| Faucet | `https://faucet.circle.com` |
| Native gas currency | USDC, 18-decimal native representation |
| USDC ERC-20 interface | `0x3600000000000000000000000000000000000000` |
| USDC ERC-20 decimals | `6` |
| Finality | Deterministic; an observed block is permanent, so the indexer does not wait for an Ethereum-style confirmation count |

Arc exposes one underlying USDC balance through both the native gas-token representation and the optional ERC-20 interface. Their precision differs: native JSON-RPC values use 18 decimals and ERC-20 methods use 6 decimals. Application deposits exclusively use the ERC-20 metadata from `ChainConfig.usdc`; no call site may hardcode token decimals.

Official sources:

- [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc)
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Arc deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)
- [Index Arc events](https://docs.arc.io/integrate/infrastructure/indexing-events)
- [Circle faucet](https://faucet.circle.com)

Runtime overrides such as `ARC_TESTNET_RPC_URL` are deployment concerns. Chain identity and token metadata remain centralized in `packages/chains`; overrides must be validated against the selected registry entry.

## XGOU deployment status

`packages/contracts/deployments/arc-testnet.json` is the single deployment registry consumed by the backend and frontend. XGOU was deployed to Arc Testnet at block `63784132` on 2026-09-24 using the official USDC ERC-20 interface.

| Contract | Address |
| --- | --- |
| DepositRouter | `0x5Ae649A4218546753c5e99C4F39d84A38be24D08` |
| BullVault | `0x8A1d9bEc810d134F637dE30bFc0ECdd7783F3c3e` |
| SpotStrategyVault | `0x149e8921b5a0bd8e005DA4453A5Fa53738bdC071` |
| FuturesStrategyVault | `0xe80C8AeA77f487b20B40426a54729F85653A9879` |
| Deployer | `0xEC37B02109f0ab1ae2cf094eA328d24ae5c826E9` |

The real Arc Testnet E2E deposit transaction is [`0x362328fc8b7de60a762a0541ba3556e41fe4bf4b2ff05e4614c501775989db55`](https://explorer.testnet.arc.io/tx/0x362328fc8b7de60a762a0541ba3556e41fe4bf4b2ff05e4614c501775989db55) at block `63786121`. A `10 USDC` intent produced `5 Bull`, `3 Spot`, `2 Futures`, and `10 Principal XP`. The Indexer recorded log index `30`; a manual replay left the Ledger, Participation, and XP counts unchanged. Reconciliation subsequently passed with zero difference in all three domains.

Source verification is complete for all four contracts. DepositRouter and SpotStrategyVault are verified directly in Arc Explorer/Blockscout. BullVault and FuturesStrategyVault returned Sourcify `exact_match`; Arc Explorer's anonymous verification endpoint was rate-limited during submission, although both addresses, creation transactions, and bytecode remain visible there. The deployment registry therefore records `verified: true` based on public exact source matches, without claiming that every source has already been imported into Blockscout.

The deployment script granted `0xEC37B02109f0ab1ae2cf094eA328d24ae5c826E9` `DEFAULT_ADMIN_ROLE`, `ALLOCATOR_ROLE`, and `PAUSER_ROLE` on the router, plus `DEFAULT_ADMIN_ROLE`, `TREASURY_ROLE`, and `PAUSER_ROLE` on all three vaults. Each vault grants `ROUTER_ROLE` to `0x5Ae649A4218546753c5e99C4F39d84A38be24D08`. These assignments and the `5000/3000/2000` BPS split were read back from Arc Testnet after deployment. The deployer EOA therefore currently has Testnet Treasury authority; this is intentional and is not hidden.

**Mainnet migration requirement:** a deployer EOA must never retain long-lived Admin or Treasury authority on mainnet. A future mainnet phase must transfer privileged roles to the approved multisig/timelock controls, verify the transfers onchain, and revoke the deployer EOA before enabling any writes. `MAINNET_ENABLED`, `REAL_TRADING_ENABLED`, and `REAL_WITHDRAWALS_ENABLED` remain `false` in Phase 2B.
