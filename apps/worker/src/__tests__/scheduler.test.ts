import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { schedulePollers, type SchedulerQueue } from '../scheduler';
import { createMockLogger } from './helpers/mock-logger';

describe('schedulePollers', { timeout: 60000 }, () => {
  let orgId: string;

  beforeAll(async () => {
    const prisma = await setupTestDb();

    const org = await prisma.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const tp = await prisma.tradingPartner.create({
      data: { orgId, name: 'TP', isaId: 'TP01', direction: 'INBOUND', isActive: true },
    });

    // 2 active connections
    await prisma.sftpConnection.create({
      data: {
        tradingPartnerId: tp.id, host: 'a', port: 22, username: 'u',
        encryptedPassword: 'x', remotePath: '/in', archivePath: '/arc',
        pollingIntervalSeconds: 60, isActive: true,
      },
    });
    await prisma.sftpConnection.create({
      data: {
        tradingPartnerId: tp.id, host: 'b', port: 22, username: 'u',
        encryptedPassword: 'x', remotePath: '/in', archivePath: '/arc',
        pollingIntervalSeconds: 120, isActive: true,
      },
    });

    // 1 inactive
    await prisma.sftpConnection.create({
      data: {
        tradingPartnerId: tp.id, host: 'c', port: 22, username: 'u',
        encryptedPassword: 'x', remotePath: '/in', archivePath: '/arc',
        pollingIntervalSeconds: 300, isActive: false,
      },
    });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should schedule only active SFTP connections', async () => {
    const jobs: Array<{ name: string; data: unknown; opts: unknown }> = [];
    const mockQueue: SchedulerQueue = {
      add: async (name, data, opts) => {
        jobs.push({ name, data, opts });
      },
    };

    const count = await schedulePollers(getDb(), mockQueue);

    expect(count).toBe(2);
    expect(jobs).toHaveLength(2);
  });

  it('should log each active connection being scheduled', async () => {
    const mockQueue: SchedulerQueue = { add: async () => {} };
    const logger = createMockLogger();

    await schedulePollers(getDb(), mockQueue, logger);

    const infoMessages = logger.messages.filter((m) => m.level === 'info');
    // Should log the count of active connections found
    expect(infoMessages.some((m) => m.msg.includes('2'))).toBe(true);
    // Should log each connection host being scheduled
    expect(infoMessages.some((m) => m.msg.includes('a:22'))).toBe(true);
    expect(infoMessages.some((m) => m.msg.includes('b:22'))).toBe(true);
    // Should NOT log the inactive connection
    expect(infoMessages.some((m) => m.msg.includes('c:22'))).toBe(false);
  });

  it('should log warning when no active connections found', async () => {
    // Deactivate all connections
    await getDb().sftpConnection.updateMany({ data: { isActive: false } });

    const mockQueue: SchedulerQueue = { add: async () => {} };
    const logger = createMockLogger();

    const count = await schedulePollers(getDb(), mockQueue, logger);

    expect(count).toBe(0);
    const warnMessages = logger.messages.filter((m) => m.level === 'warn');
    expect(warnMessages.some((m) => m.msg.includes('No active SFTP connections'))).toBe(true);

    // Restore
    await getDb().sftpConnection.updateMany({
      where: { host: { in: ['a', 'b'] } },
      data: { isActive: true },
    });
  });
});
