import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { MockTransport } from '@edi-platform/sftp';
import { X12Parser } from '@edi-platform/edi-core';
import { send997Job } from '../jobs/send-997.job';

const RAW_EDI_204 = readFileSync(
  resolve(__dirname, '../../../../tests/fixtures/edi/sample_204.edi'),
  'utf-8',
);
const JEDI_204 = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../tests/fixtures/jedi/expected_204_jedi.json'), 'utf-8'),
);

const parser = new X12Parser();

describe('send997Job', { timeout: 60000 }, () => {
  let orgId: string;
  let tradingPartnerId: string;
  let sftpConnId: string;
  let txId: string;

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
        remotePath: '/outbound',
        archivePath: '/archive',
        pollingIntervalSeconds: 300,
        isActive: true,
      },
    });
    sftpConnId = conn.id;

    const tx = await prisma.transaction.create({
      data: {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        status: 'DELIVERED',
        rawEdi: RAW_EDI_204,
        isaControlNumber: '000000001',
        contentHash: 'test-hash',
        jediPayload: JEDI_204,
      },
    });
    txId = tx.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await getDb().transactionEvent.deleteMany();
  });

  it('should generate 997 and write to SFTP', async () => {
    const mockTransport = new MockTransport();

    const result = await send997Job(
      { transactionId: txId },
      { prisma: getDb(), transport: mockTransport },
    );

    expect(result.success).toBe(true);

    const files = await mockTransport.listFiles('/outbound');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/997_/);

    const content = await mockTransport.getFile(files[0]);
    const parsed = parser.parse(content.toString());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.transactionSetId).toBe('997');
    }

    const event = await getDb().transactionEvent.findFirst({
      where: { transactionId: txId },
    });
    expect(event?.type).toBe('997_SENT');
  });

  it('should fail when transaction not found', async () => {
    const mockTransport = new MockTransport();

    const result = await send997Job(
      { transactionId: 'nonexistent-id' },
      { prisma: getDb(), transport: mockTransport },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Transaction');
  });

  it('should fail when no SFTP connection configured', async () => {
    const prisma = getDb();
    await prisma.sftpConnection.updateMany({ where: { id: sftpConnId }, data: { isActive: false } });

    const mockTransport = new MockTransport();
    const result = await send997Job(
      { transactionId: txId },
      { prisma, transport: mockTransport },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SFTP');

    await prisma.sftpConnection.updateMany({ where: { id: sftpConnId }, data: { isActive: true } });
  });

  it('should fail when transaction has no jediPayload', async () => {
    const prisma = getDb();
    const emptyTx = await prisma.transaction.create({
      data: {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        status: 'DELIVERED',
        isaControlNumber: '000000099',
        contentHash: 'empty-hash',
        jediPayload: undefined,
      },
    });

    const mockTransport = new MockTransport();
    const result = await send997Job(
      { transactionId: emptyTx.id },
      { prisma, transport: mockTransport },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('jediPayload');
  });
});
