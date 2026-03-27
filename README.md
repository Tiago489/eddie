# Eddie — EDI Platform

[![CI](https://github.com/Tiago489/eddie/actions/workflows/ci.yml/badge.svg)](https://github.com/Tiago489/eddie/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-103%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)]()

A production-grade EDI platform built in TypeScript. Handles X12 EDI (204, 211, 214, 210, 990, 997) with SFTP polling, JEDI canonical format, JSONata mapping, and automatic 997 acknowledgments.

## Quick Start

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
pnpm install

# Run migrations
pnpm --filter @edi-platform/db db:migrate:dev

# Run all tests
pnpm test

# Start all apps
pnpm dev
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
