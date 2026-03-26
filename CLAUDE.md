# EDI Platform (Eddie)

## Architecture

```
apps/api      → Fastify REST API (stateless, horizontally scalable)
apps/worker   → BullMQ job processor (SFTP polling, EDI processing)
apps/web      → Next.js 14 frontend (admin UI)
packages/edi-core  → X12 parser + serializer
packages/jedi      → JEDI types + JSONata mapping evaluator
packages/sftp      → SFTP transport abstraction + poller
packages/db        → Prisma schema + generated client
packages/types     → Shared TypeScript types and interfaces
```

## Non-Negotiable Rules

- **TypeScript strict mode everywhere.** No `any`. No `@ts-ignore` without a comment explaining why.
- **TDD discipline in packages/edi-core and packages/jedi.** Write failing tests before implementation.
- **All business logic lives in packages, not in apps.** Apps are thin orchestration layers.
- **Never put secrets in code.** Use environment variables. Reference `.env.example` for required vars.
- **Every EDI file that enters the system must produce a Transaction record** with full audit trail.
- **No synchronous file I/O in hot paths.** Always use async fs operations or streams.

## Key Interfaces — Never Break These

```typescript
// FileTransport — all SFTP logic must implement this
interface FileTransport {
  listFiles(path: string, pattern?: string): Promise<string[]>
  getFile(path: string): Promise<Buffer>
  archiveFile(sourcePath: string, archivePath: string): Promise<void>
  deleteFile(path: string): Promise<void>
}

// ParseResult — all parsers must return this
type ParseResult<T> =
  | { success: true; data: T; warnings: string[] }
  | { success: false; error: string; code: ParseErrorCode }

// MappingResult — all JSONata evaluations must return this
type MappingResult<T> =
  | { success: true; output: T }
  | { success: false; error: string; expression?: string }
```

## Test Strategy

- **Test runner:** Vitest (not Jest)
- **Unit tests:** Co-located in `src/__tests__/` within each package
- **Integration tests:** Use `@testcontainers/postgresql` and `@testcontainers/redis` — never mock the DB
- **SFTP tests:** Use `mock-transport.ts` (in-memory FileTransport) for unit tests; Docker `atmoz/sftp` for integration
- **Downstream API tests:** Use `msw` (Mock Service Worker) to intercept HTTP
- **Fixture files:** All EDI samples and expected JEDI outputs live in `/tests/fixtures/`
- **Golden file pattern:** For mapping tests, assert against fixture JSON files

### Coverage Targets
| Area | Target |
|---|---|
| packages/edi-core | 90%+ |
| packages/jedi | 90%+ |
| apps/worker job handlers | 80%+ |
| apps/api routes | 70%+ |

## EDI Domain Rules

- Inbound transaction sets: **204** (Load Tender), **211** (BOL), **997** (FA)
- Outbound transaction sets: **990** (Response to Load Tender), **214** (Shipment Status), **210** (Freight Invoice), **997** (FA)
- A **997 Functional Acknowledgment must be auto-generated** for every successfully parsed inbound 204 or 211
- Deduplication: `ISA control number + SHA-256 hash of raw file content`
- JEDI is the canonical intermediate format between EDI and downstream APIs

## Queue Names (BullMQ) — Do Not Rename

- `inbound-edi` — raw EDI file processing
- `outbound-edi` — outbound JSON → EDI generation
- `sftp-poll` — repeatable polling jobs per trading partner
- `ack-997` — 997 acknowledgment generation + delivery

## Commands

```bash
pnpm dev                          # start all apps in dev mode
pnpm test                         # run all tests
pnpm test:coverage                # run with coverage report
pnpm --filter @edi-platform/db db:migrate   # run migrations
pnpm lint                         # lint all packages
pnpm format                       # format all files
docker-compose up -d              # start Postgres, Redis, SFTP
```

## Code Style

- Async/await over raw Promises
- Named exports over default exports in packages
- Barrel exports (`index.ts`) in each package
- Error classes extend `EdiPlatformError` with a `code` field
- Log with structured JSON (use `pino` in api and worker)

## When Adding a New Transaction Set

1. Add enum value to `EdiTransactionSet` in `packages/types`
2. Add schema file in `packages/edi-core/src/transaction-sets/`
3. Add fixture `.edi` file in `tests/fixtures/edi/`
4. Add expected JEDI fixture in `tests/fixtures/jedi/`
5. Write tests first (RED), then implement (GREEN), then refactor
6. Add JEDI type in `packages/jedi/src/types/jedi.ts`
7. Update Prisma migration if new `transactionSet` enum value needed
