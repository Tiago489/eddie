FROM node:20-alpine AS base
RUN apk add --no-cache openssl && npm install -g pnpm@10 tsx

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN pnpm --filter @edi-platform/db db:generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./

EXPOSE 3001
CMD ["tsx", "apps/api/src/server.ts"]
