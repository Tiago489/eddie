import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@edi-platform/db';
import { execSync } from 'child_process';

let prisma: PrismaClient;
let container: StartedPostgreSqlContainer;

export async function setupTestDb() {
  container = await new PostgreSqlContainer('postgres:16').withDatabase('edi_test').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  execSync('pnpm --filter @edi-platform/db db:migrate:deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({
    datasources: { db: { url } },
  });
  return prisma;
}

export async function teardownTestDb() {
  await prisma.$disconnect();
  await container.stop();
}

export function getDb() {
  return prisma;
}
