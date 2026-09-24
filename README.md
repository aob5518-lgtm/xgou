# XGOU Core Platform

XGOU（小狗）是面向 Crypto 市场周期的资产配置、策略交易与 XP 收益权重平台。本仓库采用 `pnpm + Turborepo`，当前完成 Phase 1、Phase 2A 与 Phase 2.5 Frontend Preview：身份与 XP 网络、资金域模型、50/30/20 分配、双重记账 Ledger 和不依赖后端的高保真 Demo 前端。所有资金环境默认并将持续保持 Local / Testnet / Sandbox / Paper Trading，任何真实场所或真实私钥必须通过后续 Adapter 接入。

## Phase 1 已实现

- SIWE nonce → 钱包签名 → 后端验证 → access/refresh session；nonce 五分钟过期且仅能消费一次。
- Refresh token 仅存哈希、支持轮换与撤销；HttpOnly/Secure/SameSite cookie 配合双提交 CSRF token。
- 用户、角色、风控标记、不可变审计日志的数据库模型。
- 推荐人只能在首次参与前绑定一次；禁止自邀和成环；Serializable 事务避免并发双绑。
- Referral Closure Table，支持固定成本查询 1–30 层网络。
- `Decimal(36,18)` / `decimal.js` XP 运算，无 JavaScript 浮点资产计算。
- 可版本化系统参数：有效邀请门槛、最大层级、XP 汇率和动态 XP 比例。
- 100 用户幂等 seed；核心单元及跨包集成测试覆盖 31 层边界。

## Phase 2A 已实现

- 正式资金模型：50% Bull Master Vault、30% Spot Strategy Treasury、20% Futures Strategy Treasury。
- `@xgou/ledger` Money Value Object；金额采用 Decimal，账本统一 18 位精度，Token decimals 单独保存。
- Deposit、FundAllocation、LedgerAccount、LedgerTransaction、LedgerEntry、Vault、TreasuryAccount 数据模型。
- Deposit Confirmation 和 Fund Allocation 分成两笔各自平衡的双分录 Journal。
- Ledger transaction/entry append-only；修正使用新 reversal transaction，不允许覆盖历史。
- PostgreSQL deferred constraint trigger 在提交时按资产验证借贷平衡，并验证 account asset/fund domain。
- 账本账户不保存可随意修改的 balance；余额由 LedgerEntry 重建。
- Deposit intent API：`POST/GET /v1/funds/deposits`。链上确认与 50/30/20 入账由内部服务执行，不能由用户伪造确认。
- `ReferralService.tree()` 已改为读取版本化 `maxReferralDepth`，不再硬编码 30。

## Frontend Preview

- `apps/web` 是 Next.js App Router + TypeScript + Tailwind CSS 的独立产品预览，包含 Landing、Dashboard、Bull Fund、Agent、Rewards、XP Network、Activity、Join 与 Settings。
- XGOU Brain 使用 Three.js / React Three Fiber 粒子系统；支持 reduced motion、移动端低粒子模式及无 WebGL fallback。
- Demo Data 经 `XgouDataProvider` 注入，UI 不感知 Demo/API 数据来源。
- Wallet Connect 仅显示地址；不发送 Approve、Deposit、Withdraw 或任何真实交易。
- Join 50/30/20 和 Reward 5% fee 使用 `decimal.js`，每页均显示 Demo 安全标识。

## Monorepo

```text
apps/api                   NestJS REST API
apps/web                   Next.js XGOU frontend preview
packages/database          Prisma schema, migration, seed and client factory
packages/referral-engine   Referral graph invariants and closure planning
packages/xp-engine         Principal/Dynamic/Total XP calculations
packages/ledger            Money, fund allocation and double-entry invariants
packages/shared            Runtime validation and shared configuration contracts
docs                       Architecture, decisions and security notes
```

后续 Phase 会按顺序加入 Arc Chain Registry 与 Vault contracts、Paper Spot/Futures、risk engine、reward settlement、Web/Admin 和 XGOU Brain；未完成阶段没有用假接口伪装为已完成能力。

## Local setup

要求 Node.js 22+、pnpm 11.19+、Docker Compose。

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter @xgou/api dev
```

API 默认监听 `http://localhost:3001/v1`。健康检查为 `GET /v1/health`。

### Local Frontend Setup

Frontend Preview 默认完全离线使用 Demo Data，不要求 PostgreSQL、API 或链上合约：

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm --filter @xgou/web dev
```

打开 `http://localhost:3000`。使用 `pnpm dev` 可同时启动 Web `:3000` 和 API `:3001`（API 功能需本地数据库）。

## Demo Mode

`NEXT_PUBLIC_DEMO_MODE=true` 是 Preview 默认值。所有 `NEXT_PUBLIC_*` 变量只包含公开配置，不允许 secret。Demo 不会发送资产、token approval、合约调用或 CEX 命令。

## Vercel Deployment

导入 `aob5518-lgtm/xgou` 并使用以下设置：

- Root Directory: `apps/web`
- Framework Preset: Next.js
- Install Command: Vercel 默认 `pnpm install`；仅在 workspace 无法自动识别时显式设为 `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: Next.js default（留空）
- Node.js: 22
- Environment: 按 `apps/web/.env.example` 配置四个公开变量

Preview 保持 `NEXT_PUBLIC_DEMO_MODE=true`，因此页面不会请求 `NEXT_PUBLIC_API_URL`，也不依赖 API、PostgreSQL、Redis 或 RPC 才能渲染。前端部署不得加入数据库、JWT、私钥、交易所或 RPC Secret。

## Authentication API

1. `POST /v1/auth/nonce`，body 为 `{ "walletAddress": "0x..." }`。
2. 客户端使用返回 nonce、配置的 domain/URI 和 Sepolia chain ID 构建并签署 EIP-4361 消息。
3. `POST /v1/auth/verify`，body 为 `{ "message": "...", "signature": "0x..." }`。
4. 后续业务请求使用 `Authorization: Bearer <accessToken>`。
5. `POST /v1/auth/refresh` 和 `/logout` 同时发送 refresh cookie 与 `x-csrf-token` header。

推荐接口为 `POST /v1/referrals/bind`、`GET /v1/referrals/tree`；XP 摘要为 `GET /v1/xp/me`；资金参与意图接口为 `POST/GET /v1/funds/deposits`。

## Environment variables

`.env.example` 是当前运行环境清单。JWT secret 与 IP hash salt 必须由部署环境秘密管理器提供；仓库不包含真实 key。`DATABASE_URL` 是 PostgreSQL 的唯一账务数据源连接。Redis 已编排但绝不是余额或账本最终数据源。

## Database migration and seed

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

迁移包含 Prisma schema 无法表达的约束：闭包深度/自关系、正数金额、Ledger 借贷平衡、资金域隔离，以及阻止更新或删除 AuditLog 与已入账 Ledger 的数据库触发器。

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

测试重点包括原有 XP/推荐规则，以及 10,000 USDC → 5,000/3,000/2,000、配置必须合计 1.00、Journal 平衡、精度余数守恒、余额重建和跨资金域拒绝。

## Security model

- 用户不能仅凭 wallet address 登录；必须验证 SIWE 签名。
- Nonce、refresh token、IP 均只保存哈希或不可逆派生值；生产 cookie 强制 Secure。
- 输入经 Zod 校验，数据访问经 Prisma 参数化查询。
- Helmet、严格 CORS、API rate limiting、JWT rotation、RBAC 数据模型和 append-only audit log 已建立。
- 资金、交易、钱包和 AI Agent 不属于 Phase 1；未来实现必须遵循 Adapter + Risk Engine，Agent 永远不能直接持有私钥或调用提现权限。

## Demo mode

`DEMO_MODE=true` 只代表本地/沙盒体验，不降低认证、账务或风控不变量。Phase 1 seed 提供 100 个确定性测试钱包及推荐网络；它们不是生产账户。

## Production checklist

- 使用托管 PostgreSQL、连接池、备份与 point-in-time recovery。
- 从 secrets manager 注入所有 secret，配置轮换和不同环境的 IP hash salt。
- 在可信代理后正确配置客户端 IP，并限制 `WEB_ORIGIN`。
- 运行迁移审查、依赖审计、SAST/DAST、渗透测试和灾备演练。
- 所有资产动作必须双重记账、幂等并经 reconciliation；任何真实资金上线前必须完成独立合约与账务审计。

完整拓扑见 [Architecture](docs/architecture.md)、[Fund Architecture](docs/fund-architecture.md)、[Ledger](docs/ledger.md) 和 [Frontend](docs/frontend.md)，工程取舍见 [Decisions](docs/decisions.md)。
