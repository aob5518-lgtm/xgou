# XGOU frontend

`apps/web` is the frozen Next.js App Router UI. The visual system remains unchanged; V1 adds functional wiring and explicit runtime states.

## Modes

- `NEXT_PUBLIC_APP_MODE=demo`: the only mode allowed to instantiate `DemoXgouDataProvider`.
- `NEXT_PUBLIC_APP_MODE=testnet`: uses `ApiXgouDataProvider`, Arc Testnet wallet/SIWE and the deployed DepositRouter. API failures produce typed unavailable/authentication errors and never return Demo fixtures.
- `production`: reserved and not enabled. Mainnet, live trading, real withdrawals and real reward distribution remain disabled.

TESTNET Dashboard, Bull Fund, Agent, Rewards, XP and Activity are loaded in the browser after SIWE so the bearer session never runs during static generation. Access-token expiry attempts the existing CSRF-protected refresh flow once; failure clears the session and returns to an explicit login-required state.

The Join flow reads the deployment and chain registries, wallet USDC balance, minimum deposit configuration and allowance. It creates an idempotent intent, approves only the requested amount when necessary, submits to the Arc Testnet router, waits for the receipt and polls the exact deposit until allocation completes. It never presents a submitted transaction as completed prematurely.

## Vercel

- Repository: `aob5518-lgtm/xgou`
- Root Directory: `apps/web`
- Framework: Next.js
- Node.js: 22
- Install: Vercel default pnpm install
- Build: `pnpm build`
- Output Directory: empty / Next.js default

For a Demo preview configure `NEXT_PUBLIC_APP_MODE=demo`. For the V1 acceptance deployment configure `NEXT_PUBLIC_APP_MODE=testnet`, `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_CHAIN_ENV=arc-testnet`, and a publicly reachable HTTPS `NEXT_PUBLIC_API_URL` ending in `/v1`. Never add database, JWT, private-key, RPC-secret or exchange credentials to the frontend project.

## Responsive and fallback behavior

The existing responsive layout covers 375, 390, 430, 768, 1024 and 1440 pixel widths. Join controls wrap safely, transaction hashes break across lines, and disabled wallet/network/session states remain keyboard accessible. WebGL capability and reduced-motion checks continue to select the static Brain fallback.
