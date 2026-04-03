import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createMockQueue } from './helpers/mock-queue';
import { createMockLogger } from './helpers/mock-logger';
import { MockTransport } from '@edi-platform/sftp';
import { pollSftpJob } from '../jobs/poll-sftp.job';

const RAW_EDI_204 = readFileSync(
  resolve(__dirname, '../../../../tests/fixtures/edi/sample_204.edi'),
  'utf-8',
);

describe('pollSftpJob', { timeout: 60000 }, () => {
  let orgId: string;
  let tradingPartnerId: string;
  let sftpConnId: string;

  beforeAll(async () => {
    const prisma = await setupTestDb();

    const org = await prisma.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const tp = await prisma.tradingPartner.create({
      data: { orgId, name: 'Carrier', isaId: 'CARRIER', direction: 'INBOUND', isActive: true },
    });
    tradingPartnerId = tp.id;

    const conn = await prisma.sftpConnection.create({
      data: {
        tradingPartnerId,
        host: 'localhost',
        port: 2222,
        username: 'ediuser',
        encryptedPassword: 'test',
        remotePath: '/inbound',
        archivePath: '/archive',
        filePattern: '*.edi',
        pollingIntervalSeconds: 300,
        isActive: true,
      },
    });
    sftpConnId = conn.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await getDb().transactionEvent.deleteMany();
    await getDb().transaction.deleteMany();
  });

  it('should find files, enqueue them, and archive', async () => {
    const mockTransport = new MockTransport();
    mockTransport.addFile('/inbound/test1.edi', RAW_EDI_204);
    mockTransport.addFile('/inbound/test2.edi', RAW_EDI_204.replace('000000001', '000000002'));

    const mockQueue = createMockQueue();

    const result = await pollSftpJob(
      { sftpConnectionId: sftpConnId },
      { prisma: getDb(), transport: mockTransport, queues: { inboundEdi: mockQueue } },
    );

    expect(result.success).toBe(true);
    expect(result.filesFound).toBe(2);
    expect(result.filesEnqueued).toBe(2);
    expect(mockQueue.jobs).toHaveLength(2);
    expect(mockQueue.jobs[0].name).toBe('process-inbound');

    const remaining = await mockTransport.listFiles('/inbound', '*.edi');
    expect(remaining).toHaveLength(0);

    const archived = mockTransport.getArchivedFiles();
    expect(archived.size).toBe(2);
  });

  it('should return zero counts when no files exist', async () => {
    const mockTransport = new MockTransport();
    const mockQueue = createMockQueue();

    const result = await pollSftpJob(
      { sftpConnectionId: sftpConnId },
      { prisma: getDb(), transport: mockTransport, queues: { inboundEdi: mockQueue } },
    );

    expect(result.success).toBe(true);
    expect(result.filesFound).toBe(0);
    expect(result.filesEnqueued).toBe(0);
  });

  it('should skip already-processed files but still archive', async () => {
    const contentHash = createHash('sha256').update(RAW_EDI_204).digest('hex');

    await getDb().transaction.create({
      data: {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        status: 'DELIVERED',
        isaControlNumber: '000000001',
        contentHash,
        rawEdi: RAW_EDI_204,
      },
    });

    const mockTransport = new MockTransport();
    mockTransport.addFile('/inbound/test1.edi', RAW_EDI_204);
    const mockQueue = createMockQueue();

    const result = await pollSftpJob(
      { sftpConnectionId: sftpConnId },
      { prisma: getDb(), transport: mockTransport, queues: { inboundEdi: mockQueue } },
    );

    expect(result.filesFound).toBe(1);
    expect(result.filesEnqueued).toBe(0);
    expect(result.filesSkipped).toBe(1);

    const archived = mockTransport.getArchivedFiles();
    expect(archived.size).toBe(1);
  });

  it('should fail when SFTP connection not found', async () => {
    const mockTransport = new MockTransport();
    const mockQueue = createMockQueue();

    const result = await pollSftpJob(
      { sftpConnectionId: 'bad-id' },
      { prisma: getDb(), transport: mockTransport, queues: { inboundEdi: mockQueue } },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SftpConnection');
  });

  it('should log poll start, files found count, and each file outcome', async () => {
    const mockTransport = new MockTransport();
    mockTransport.addFile('/inbound/new.edi', RAW_EDI_204.replace('000000001', '000000099'));
    const mockQueue = createMockQueue();
    const logger = createMockLogger();

    const result = await pollSftpJob(
      { sftpConnectionId: sftpConnId },
      { prisma: getDb(), transport: mockTransport, queues: { inboundEdi: mockQueue }, logger },
    );

    expect(result.success).toBe(true);

    const infoMessages = logger.messages.filter((m) => m.level === 'info');
    // Should log poll start with host and path
    expect(infoMessages.some((m) => m.msg.includes('Polling') && m.msg.includes('localhost'))).toBe(true);
    // Should log files found count
    expect(infoMessages.some((m) => m.msg.includes('1 file'))).toBe(true);
    // Should log the file being enqueued
    expect(infoMessages.some((m) => m.msg.includes('new.edi') && m.msg.includes('enqueued'))).toBe(true);
  });

  it('should log when a file is skipped as duplicate', async () => {
    const contentHash = createHash('sha256').update(RAW_EDI_204).digest('hex');

    await getDb().transaction.create({
      data: {
        orgId, tradingPartnerId, transactionSet: 'EDI_204', direction: 'INBOUND',
        status: 'DELIVERED', isaControlNumber: '000000001', contentHash, rawEdi: RAW_EDI_204,
      },
    });

    const mockTransport = new MockTransport();
    mockTransport.addFile('/inbound/dup.edi', RAW_EDI_204);
    const mockQueue = createMockQueue();
    const logger = createMockLogger();

    await pollSftpJob(
      { sftpConnectionId: sftpConnId },
      { prisma: getDb(), transport: mockTransport, queues: { inboundEdi: mockQueue }, logger },
    );

    const infoMessages = logger.messages.filter((m) => m.level === 'info');
    expect(infoMessages.some((m) => m.msg.includes('dup.edi') && m.msg.includes('skipped'))).toBe(true);
  });
});
