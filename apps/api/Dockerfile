FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps/api ./apps/api
COPY packages/database ./packages/database
COPY packages/referral-engine ./packages/referral-engine
COPY packages/shared ./packages/shared
COPY packages/xp-engine ./packages/xp-engine
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xgou/database generate
RUN pnpm --filter @xgou/shared build && pnpm --filter @xgou/referral-engine build && pnpm --filter @xgou/xp-engine build && pnpm --filter @xgou/database build && pnpm --filter @xgou/api build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
USER node
CMD ["node", "apps/api/dist/main.js"]
