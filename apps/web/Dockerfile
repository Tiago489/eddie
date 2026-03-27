FROM node:20-alpine AS base
RUN npm install -g pnpm@10

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/ ./packages/types/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_ORG_ID=default-org
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ORG_ID=$NEXT_PUBLIC_ORG_ID

RUN pnpm --filter @edi-platform/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
