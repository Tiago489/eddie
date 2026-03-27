import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { schedulePollers, type SchedulerQueue } from '../scheduler';

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
});
