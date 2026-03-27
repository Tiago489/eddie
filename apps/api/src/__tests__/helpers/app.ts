import type { PrismaClient } from '@edi-platform/db';
import { buildApp } from '../../server';

export function createTestApp(
  prisma: PrismaClient,
  queues?: Record<string, { add: (name: string, data: unknown) => Promise<void> }>,
) {
  return buildApp({ prisma, queues, logger: false });
}
