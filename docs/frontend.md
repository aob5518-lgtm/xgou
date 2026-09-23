# XGOU Frontend Preview

## Frontend architecture

`apps/web` is a Next.js App Router application inside the existing pnpm/Turborepo workspace. The landing page is public; product routes share a responsive App Shell with a desktop sidebar and mobile bottom navigation. Server components obtain view models through `XgouDataProvider`; interactive financial previews remain isolated client components.

The preview deliberately contains no deposit, approval, withdrawal, contract, exchange, or live trading command. Wallet connection is display-only.

## Demo Data Provider

`src/services/xgou-data-provider.ts` defines one interface for Dashboard, Bull, Agent, Rewards, XP, Activity, and Referral data. `DemoXgouDataProvider` reads the single typed source in `src/lib/demo-data.ts`. `ApiXgouDataProvider` defines the future HTTP boundary without coupling components to transport details.

Demo mode is enabled unless `NEXT_PUBLIC_DEMO_MODE=false` is explicitly supplied. Preview deployments must keep it enabled until matching authenticated API resources exist.

## Brain rendering

The hero brain is generated in WebGL using Three.js, React Three Fiber, and Drei point materials. Two procedural particle hemispheres preserve the Red Brain / Blue Brain identity; the blue side represents Spot 30% and Futures 20% as one Agent brain. Pointer position influences rotation and pulse without moving capital or invoking an AI service.

The canvas is dynamically imported with SSR disabled. Dashboard uses a lower particle count. No bitmap brain asset is required.

## Mobile and fallback behavior

- Responsive layout targets 375, 390, 430, 768, 1024, 1440, and 1920 pixel widths without horizontal page overflow.
- Mobile receives a lower device-pixel ratio and reduced particle count.
- `prefers-reduced-motion` replaces WebGL animation with an SVG/CSS brain.
- WebGL capability is checked before canvas initialization; unsupported browsers receive the same fallback.
- A loading fallback prevents a blank first paint while the Three.js bundle loads.

## Vercel deployment

Import the GitHub repository with repository root as Vercel Root Directory. Select Next.js, use `pnpm install --frozen-lockfile`, and set the Build Command to `pnpm --filter @xgou/web build`. Leave Output Directory empty so Vercel uses the Next.js default. Use Node.js 22 and copy only the public values from `apps/web/.env.example`.

## Future API integration

When authenticated preview endpoints are available, set `NEXT_PUBLIC_DEMO_MODE=false` and implement endpoint mapping in `ApiXgouDataProvider`. Chain registry, Arc parameters, contract writes, SIWE UI integration, real reward settlement, and trading execution remain later phases. They must not be added as client-side shortcuts.
