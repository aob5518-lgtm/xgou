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

`packages/contracts/deployments/arc-testnet.json` is the single deployment registry consumed by the backend and frontend. It currently records the contract version and official USDC address but remains `deployed: false` until an authorized `DEPLOYER_PRIVATE_KEY` is supplied. The application therefore keeps Testnet participation writes disabled rather than guessing or substituting contract addresses.
