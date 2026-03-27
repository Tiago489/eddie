# Eddie — EDI Platform

[![CI](https://github.com/Tiago489/eddie/actions/workflows/ci.yml/badge.svg)](https://github.com/Tiago489/eddie/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-104%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()

A production-grade EDI platform built in TypeScript. Handles X12 EDI (204, 211, 214, 210, 990, 997) with SFTP polling, JEDI canonical format, JSONata mapping, and automatic 997 acknowledgments.

## First Time Setup

```bash
# 1. Start infrastructure + seed database
pnpm setup

# 2. Copy the org ID into the web env
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > apps/web/.env.local
echo "NEXT_PUBLIC_ORG_ID=seed-org-001" >> apps/web/.env.local

# 3. Start all apps
pnpm dev

# 4. Open the UI
open http://localhost:3000
```

## Quick Start

```bash
docker compose up -d        # Start Postgres, Redis, SFTP
pnpm install                # Install dependencies
pnpm test                   # Run all 104 tests
pnpm dev                    # Start all apps
```

## Architecture

```
apps/api       → Fastify REST API
apps/worker    → BullMQ job processor
apps/web       → Next.js 14 admin UI
packages/
  edi-core     → X12 parser + serializer
  jedi         → JEDI transforms + JSONata evaluator
  sftp         → SFTP transport abstraction
  db           → Prisma schema + client
  types        → Shared TypeScript types
```

## Test Coverage

| Package | Coverage |
|---------|----------|
| edi-core | 100% |
| jedi | 100% |
| apps/worker | 97%+ |
| apps/api | 90%+ |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm setup` | Full onboarding: docker + install + migrate + seed |
| `pnpm dev` | Start all apps in dev mode |
| `pnpm test` | Run all tests |
| `pnpm db:seed` | Seed database with sample data |
| `pnpm db:reset` | Reset database and re-run migrations |
| `pnpm generate:key` | Generate a new ENCRYPTION_KEY |
