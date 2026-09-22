# XGOU Core Platform

XGOU（小狗）是面向 Crypto 市场周期的资产配置、策略交易与 XP 收益权重平台。本仓库采用 `pnpm + Turborepo`，当前完成 Phase 1：PostgreSQL 数据模型、SIWE 用户认证、推荐关系和 XP 领域引擎。所有资金环境默认并将持续保持 Testnet / Sandbox / Paper Trading，任何真实场所或真实私钥必须通过后续 Adapter 接入。

## Phase 1 已实现

- SIWE nonce → 钱包签名 → 后端验证 → access/refresh session；nonce 五分钟过期且仅能消费一次。
- Refresh token 仅存哈希、支持轮换与撤销；HttpOnly/Secure/SameSite cookie 配合双提交 CSRF token。
- 用户、角色、风控标记、不可变审计日志的数据库模型。
- 推荐人只能在首次参与前绑定一次；禁止自邀和成环；Serializable 事务避免并发双绑。
- Referral Closure Table，支持固定成本查询 1–30 层网络。
- `Decimal(36,18)` / `decimal.js` XP 运算，无 JavaScript 浮点资产计算。
- 可版本化系统参数：有效邀请门槛、最大层级、XP 汇率和动态 XP 比例。
- 100 用户幂等 seed；核心单元及跨包集成测试覆盖 31 层边界。

## Monorepo

```text
apps/api                   NestJS REST API
packages/database          Prisma schema, migration, seed and client factory
packages/referral-engine   Referral graph invariants and closure planning
packages/xp-engine         Principal/Dynamic/Total XP calculations
packages/shared            Runtime validation and shared configuration contracts
docs                       Architecture, decisions and security notes
```

后续 Phase 会按需求顺序加入 ledger、vault、paper strategies、reward settlement、Bull Fund、Web/Admin 和 XGOU Brain；未完成阶段没有用假接口伪装为已完成能力。

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

## Authentication API

1. `POST /v1/auth/nonce`，body 为 `{ "walletAddress": "0x..." }`。
2. 客户端使用返回 nonce、配置的 domain/URI 和 Sepolia chain ID 构建并签署 EIP-4361 消息。
3. `POST /v1/auth/verify`，body 为 `{ "message": "...", "signature": "0x..." }`。
4. 后续业务请求使用 `Authorization: Bearer <accessToken>`。
5. `POST /v1/auth/refresh` 和 `/logout` 同时发送 refresh cookie 与 `x-csrf-token` header。

推荐接口为 `POST /v1/referrals/bind`、`GET /v1/referrals/tree`；XP 摘要为 `GET /v1/xp/me`。

## Environment variables

`.env.example` 是完整的 Phase 1 清单。JWT secret 与 IP hash salt 必须由部署环境秘密管理器提供；仓库不包含真实 key。`DATABASE_URL` 是 PostgreSQL 的唯一账务数据源连接。Redis 已编排但在 Phase 1 不作为用户或 XP 的最终数据源。

## Database migration and seed

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

首个迁移还增加 Prisma schema 无法表达的约束：闭包深度/自关系、正数参与金额，以及阻止更新和删除 AuditLog 的数据库触发器。

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

测试重点包括 1 个有效直推解锁 3 层、10 个封顶 30 层、第 31 层不计入 Dynamic XP、只用 Principal XP、推荐循环防护和永久绑定。

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
- Phase 2 起所有资产动作必须双重记账、幂等并经 reconciliation；任何真实资金上线前必须完成独立合约与账务审计。

完整拓扑见 [Architecture](docs/architecture.md)，工程取舍见 [Decisions](docs/decisions.md)。
