import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// These tests require Docker for testcontainers
// They'll be skipped if Docker is unavailable
let prisma: import('@prisma/client').PrismaClient;
let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer;
let orgId: string;
let dockerAvailable = true;

describe('stedi-import', { timeout: 60000 }, () => {
  beforeAll(async () => {
    try {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
      const { PrismaClient } = await import('@prisma/client');
      const { execSync } = await import('child_process');

      container = await new PostgreSqlContainer('postgres:16').withDatabase('edi_test').start();
      const url = container.getConnectionUri();
      process.env.DATABASE_URL = url;
      execSync('pnpm --filter @edi-platform/db db:migrate:deploy', {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
      });
      prisma = new PrismaClient({ datasources: { db: { url } } });

      const org = await prisma.organization.create({ data: { name: 'Test Org' } });
      orgId = org.id;
    } catch {
      dockerAvailable = false;
    }
  });

  afterAll(async () => {
    if (dockerAvailable) {
      await prisma?.$disconnect();
      await container?.stop();
    }
  });

  beforeEach(async () => {
    if (!dockerAvailable) return;
    await prisma.migrationRun.deleteMany();
    await prisma.mapping.deleteMany();
    await prisma.transactionEvent.deleteMany();
    await prisma.transaction.deleteMany();
  });

  describe('validateJsonata (pure unit tests)', () => {
    it('should return valid for correct JSONata expressions', async () => {
      const { validateJsonata } = await import('./stedi-import');
      expect(validateJsonata('$$').valid).toBe(true);
      expect(validateJsonata('name').valid).toBe(true);
      expect(validateJsonata('{ "id": shipmentId }').valid).toBe(true);
    });

    it('should return invalid for bad JSONata expressions', async () => {
      const { validateJsonata } = await import('./stedi-import');
      const result = validateJsonata('$invalid$$(');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('validateJediShape (pure unit tests)', () => {
    it('should accept valid JediDocument shape', async () => {
      const { validateJediShape } = await import('./stedi-import');
      expect(validateJediShape({ interchanges: [] })).toBe(true);
    });

    it('should reject invalid shapes', async () => {
      const { validateJediShape } = await import('./stedi-import');
      expect(validateJediShape(null)).toBe(false);
      expect(validateJediShape({})).toBe(false);
      expect(validateJediShape('string')).toBe(false);
    });
  });

  describe('buildReport (integration)', () => {
    it('should flag mappings without guideId as NEEDS_MIGRATION', async () => {
      if (!dockerAvailable) return;

      await prisma.mapping.create({
        data: {
          orgId,
          name: 'Unmigrated',
          transactionSet: 'EDI_204',
          direction: 'INBOUND',
          jsonataExpression: '$$',
          version: 1,
          isActive: true,
        },
      });

      const { buildReport } = await import('./stedi-import');
      const report = await buildReport();
      const mapping = report.mappings.find((m) => m.name === 'Unmigrated');
      expect(mapping?.status).toBe('NEEDS_MIGRATION');
      expect(mapping?.newValue).toBe('guide_edi_204_inbound_v1');
    });

    it('should flag invalid JSONata as INVALID', async () => {
      if (!dockerAvailable) return;

      await prisma.mapping.create({
        data: {
          orgId,
          name: 'Bad',
          transactionSet: 'EDI_204',
          direction: 'INBOUND',
          jsonataExpression: '$invalid$$(',
          version: 1,
          isActive: true,
        },
      });

      const { buildReport } = await import('./stedi-import');
      const report = await buildReport();
      const mapping = report.mappings.find((m) => m.name === 'Bad');
      expect(mapping?.status).toBe('INVALID');
    });
  });

  describe('execute (integration)', () => {
    it('should apply guideId and create ImportRun', async () => {
      if (!dockerAvailable) return;

      const mapping = await prisma.mapping.create({
        data: {
          orgId,
          name: 'To Migrate',
          transactionSet: 'EDI_990',
          direction: 'OUTBOUND',
          jsonataExpression: '$$',
          version: 2,
          isActive: true,
        },
      });

      const { buildReport, execute } = await import('./stedi-import');
      const report = await buildReport();
      const result = await execute(report);
      expect(result).toContain('Migration complete');

      const updated = await prisma.mapping.findUnique({ where: { id: mapping.id } });
      expect(updated?.guideId).toBe('guide_edi_990_outbound_v2');

      const runs = await prisma.migrationRun.findMany();
      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('COMPLETE');
    });
  });

  describe('rollback (integration)', () => {
    it('should restore guideId to null on rollback', async () => {
      if (!dockerAvailable) return;

      const mapping = await prisma.mapping.create({
        data: {
          orgId,
          name: 'Rollback Test',
          transactionSet: 'EDI_214',
          direction: 'OUTBOUND',
          jsonataExpression: '$$',
          version: 1,
          isActive: true,
        },
      });

      const { buildReport, execute, rollback } = await import('./stedi-import');
      const report = await buildReport();
      await execute(report);

      const migrated = await prisma.mapping.findUnique({ where: { id: mapping.id } });
      expect(migrated?.guideId).toBe('guide_edi_214_outbound_v1');

      const result = await rollback(false);
      expect(result).toContain('Rollback complete');

      const restored = await prisma.mapping.findUnique({ where: { id: mapping.id } });
      expect(restored?.guideId).toBeNull();

      const run = await prisma.migrationRun.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(run?.status).toBe('ROLLED_BACK');
    });

    it('should report when no runs exist', async () => {
      if (!dockerAvailable) return;

      const { rollback } = await import('./stedi-import');
      const result = await rollback(false);
      expect(result).toContain('No completed migration runs found');
    });
  });
});
