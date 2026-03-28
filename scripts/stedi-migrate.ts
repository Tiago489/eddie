try { require('dotenv/config'); } catch { /* dotenv not available in test context */ }
import { PrismaClient } from '@prisma/client';
import jsonata from 'jsonata';

const prisma = new PrismaClient();

interface MappingReport {
  id: string;
  name: string;
  status: 'OK' | 'NEEDS_MIGRATION' | 'INVALID';
  reason: string;
  previousValue?: unknown;
  newValue?: unknown;
}

interface TransactionReport {
  id: string;
  status: 'OK' | 'INVALID';
  reason: string;
}

interface MigrationReport {
  mappings: MappingReport[];
  transactions: TransactionReport[];
  summary: { ok: number; needsMigration: number; invalid: number };
}

function validateJsonata(expression: string): { valid: boolean; error?: string } {
  try {
    jsonata(expression);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

function validateJediShape(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const doc = payload as Record<string, unknown>;
  if (!Array.isArray(doc.interchanges)) return false;
  return true;
}

async function buildReport(): Promise<MigrationReport> {
  const mappings = await prisma.mapping.findMany();
  const transactions = await prisma.transaction.findMany({
    where: { jediPayload: { not: null } },
    select: { id: true, jediPayload: true },
  });

  const mappingReports: MappingReport[] = [];
  let ok = 0;
  let needsMigration = 0;
  let invalid = 0;

  for (const m of mappings) {
    const jsonataResult = validateJsonata(m.jsonataExpression);

    if (!jsonataResult.valid) {
      mappingReports.push({
        id: m.id,
        name: m.name,
        status: 'INVALID',
        reason: `Invalid JSONata expression: ${jsonataResult.error}`,
      });
      invalid++;
    } else if (!m.stediGuideId) {
      mappingReports.push({
        id: m.id,
        name: m.name,
        status: 'NEEDS_MIGRATION',
        reason: 'Missing stediGuideId',
        previousValue: null,
        newValue: `guide_${m.transactionSet.toLowerCase()}_${m.direction.toLowerCase()}_v${m.version}`,
      });
      needsMigration++;
    } else {
      mappingReports.push({
        id: m.id,
        name: m.name,
        status: 'OK',
        reason: 'Already migrated',
      });
      ok++;
    }
  }

  const transactionReports: TransactionReport[] = [];
  for (const t of transactions) {
    if (validateJediShape(t.jediPayload)) {
      transactionReports.push({ id: t.id, status: 'OK', reason: 'Valid JEDI shape' });
    } else {
      transactionReports.push({ id: t.id, status: 'INVALID', reason: 'jediPayload does not conform to JediDocument shape' });
      invalid++;
    }
  }

  return {
    mappings: mappingReports,
    transactions: transactionReports,
    summary: { ok, needsMigration, invalid },
  };
}

async function execute(report: MigrationReport): Promise<string> {
  const toMigrate = report.mappings.filter((m) => m.status === 'NEEDS_MIGRATION');
  if (toMigrate.length === 0) return 'Nothing to migrate.';

  const migrationRun = await prisma.$transaction(async (tx) => {
    const run = await tx.migrationRun.create({
      data: {
        status: 'PENDING',
        report: report as unknown as Record<string, unknown>,
      },
    });

    for (const m of toMigrate) {
      await tx.mapping.update({
        where: { id: m.id },
        data: { stediGuideId: m.newValue as string },
      });
    }

    await tx.migrationRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETE' },
    });

    return run;
  });

  return `Migration complete. MigrationRun ID: ${migrationRun.id}. ${toMigrate.length} mappings updated.`;
}

async function rollback(dryRun: boolean): Promise<string> {
  const lastRun = await prisma.migrationRun.findFirst({
    where: { status: 'COMPLETE' },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastRun) return 'No completed migration runs found to roll back.';

  const report = lastRun.report as unknown as MigrationReport;
  const toRollback = report.mappings.filter((m) => m.status === 'NEEDS_MIGRATION');

  if (toRollback.length === 0) return 'Nothing to roll back.';

  console.log(`\nRolling back MigrationRun ${lastRun.id}:`);
  for (const m of toRollback) {
    console.log(`  ${m.id}: stediGuideId "${m.newValue}" → null`);
  }

  if (dryRun) return 'Dry run — no changes made. Pass --execute to confirm rollback.';

  await prisma.$transaction(async (tx) => {
    for (const m of toRollback) {
      await tx.mapping.update({
        where: { id: m.id },
        data: { stediGuideId: null },
      });
    }

    await tx.migrationRun.update({
      where: { id: lastRun.id },
      data: { status: 'ROLLED_BACK', rolledBackAt: new Date() },
    });
  });

  return `Rollback complete. ${toRollback.length} mappings restored.`;
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isRollback = args.includes('--rollback');

  if (isRollback) {
    const result = await rollback(isExecute ? false : true);
    console.log(result);
    await prisma.$disconnect();
    return;
  }

  console.log('Stedi Migration Report');
  console.log('======================\n');

  const report = await buildReport();

  console.log('Mappings:');
  for (const m of report.mappings) {
    const icon = m.status === 'OK' ? 'OK' : m.status === 'NEEDS_MIGRATION' ? 'MIGRATE' : 'INVALID';
    console.log(`  [${icon}] ${m.name} (${m.id}): ${m.reason}`);
    if (m.newValue) console.log(`         → stediGuideId: ${m.newValue}`);
  }

  if (report.transactions.length > 0) {
    const invalidTx = report.transactions.filter((t) => t.status === 'INVALID');
    console.log(`\nTransactions: ${report.transactions.length} checked, ${invalidTx.length} invalid`);
    for (const t of invalidTx) {
      console.log(`  [INVALID] ${t.id}: ${t.reason}`);
    }
  }

  console.log(`\nSummary: ${report.summary.ok} OK, ${report.summary.needsMigration} need migration, ${report.summary.invalid} invalid`);

  if (!isExecute) {
    console.log('\nDry run — no changes made. Pass --execute to apply.');
    await prisma.$disconnect();
    process.exit(report.summary.needsMigration > 0 || report.summary.invalid > 0 ? 1 : 0);
  }

  if (report.summary.invalid > 0) {
    console.log('\nCannot execute: there are INVALID records. Fix them first.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const result = await execute(report);
  console.log(`\n${result}`);
  await prisma.$disconnect();
}

export { buildReport, execute, rollback, validateJsonata, validateJediShape, prisma as _prisma };

// Only run main() when executed directly, not when imported by tests
const isDirectRun = process.argv[1]?.includes('stedi-migrate') && !process.argv[1]?.includes('vitest');
if (isDirectRun) {
  main().catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  });
}
