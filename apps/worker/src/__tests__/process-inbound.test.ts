import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createMockApi } from './helpers/mock-api';
import { createMockQueue } from './helpers/mock-queue';
import { processInboundJob } from '../jobs/process-inbound.job';

const RAW_EDI_204 = readFileSync(
  resolve(__dirname, '../../../../tests/fixtures/edi/sample_204.edi'),
  'utf-8',
);

describe('processInboundJob', { timeout: 60000 }, () => {
  let orgId: string;
  let tradingPartnerId: string;

  beforeAll(async () => {
    const prisma = await setupTestDb();

    const org = await prisma.organization.create({
      data: { name: 'Test Org' },
    });
    orgId = org.id;

    const tp = await prisma.tradingPartner.create({
      data: {
        orgId,
        name: 'Test Partner',
        isaId: 'SHIPPER',
        isActive: true,
        direction: 'INBOUND',
      },
    });
    tradingPartnerId = tp.id;

    await prisma.downstreamApi.create({
      data: {
        orgId,
        name: 'Test API',
        baseUrl: 'http://mock-api.test',
        authType: 'NONE',
        timeoutMs: 3000,
      },
    });

    await prisma.mapping.create({
      data: {
        orgId,
        name: 'Identity 204',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        jsonataExpression: '$$',
        version: 1,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await getDb().transactionEvent.deleteMany();
    await getDb().transaction.deleteMany();
  });

  it('should process a valid 204 EDI end-to-end', async () => {
    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 200, { ok: true });
    server.listen();

    const result = await processInboundJob(
      { rawEdi: RAW_EDI_204, tradingPartnerId, orgId },
      { prisma: getDb(), queues: { ack997: queue } },
    );

    server.close();

    expect(result.success).toBe(true);

    const tx = await getDb().transaction.findFirst();
    expect(tx?.status).toBe('DELIVERED');
    expect(tx?.rawEdi).toBe(RAW_EDI_204);
    expect(tx?.jediPayload).not.toBeNull();
    expect(tx?.downstreamStatusCode).toBe(200);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].name).toBe('send-997');
  });

  it('should detect duplicate EDI by contentHash', async () => {
    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 200, { ok: true });
    server.listen();

    const deps = { prisma: getDb(), queues: { ack997: queue } };
    const payload = { rawEdi: RAW_EDI_204, tradingPartnerId, orgId };

    const result1 = await processInboundJob(payload, deps);
    expect(result1.success).toBe(true);

    const result2 = await processInboundJob(payload, deps);
    expect(result2.success).toBe(true);

    server.close();

    const txs = await getDb().transaction.findMany({ orderBy: { createdAt: 'asc' } });
    expect(txs).toHaveLength(2);
    expect(txs[0].status).toBe('DELIVERED');
    expect(txs[1].status).toBe('DUPLICATE');
  });

  it('should mark transaction FAILED on parse error', async () => {
    const queue = createMockQueue();

    const result = await processInboundJob(
      { rawEdi: 'NOT_EDI_AT_ALL', tradingPartnerId, orgId },
      { prisma: getDb(), queues: { ack997: queue } },
    );

    expect(result.success).toBe(false);

    const tx = await getDb().transaction.findFirst();
    expect(tx?.status).toBe('FAILED');
    expect(tx?.errorMessage).toBeTruthy();
  });

  it('should mark transaction FAILED when downstream returns 500', async () => {
    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 500, { error: 'Internal Server Error' });
    server.listen();

    const result = await processInboundJob(
      { rawEdi: RAW_EDI_204, tradingPartnerId, orgId },
      { prisma: getDb(), queues: { ack997: queue } },
    );

    server.close();

    expect(result.success).toBe(false);

    const tx = await getDb().transaction.findFirst();
    expect(tx?.status).toBe('FAILED');
    expect(tx?.downstreamStatusCode).toBe(500);
  });

  it('should mark transaction FAILED on downstream timeout', async () => {
    const prisma = getDb();

    await prisma.downstreamApi.updateMany({
      where: { orgId },
      data: { timeoutMs: 500 },
    });

    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 200, {}, 5000);
    server.listen();

    const result = await processInboundJob(
      { rawEdi: RAW_EDI_204, tradingPartnerId, orgId },
      { prisma, queues: { ack997: queue } },
    );

    server.close();

    expect(result.success).toBe(false);

    const tx = await prisma.transaction.findFirst();
    expect(tx?.status).toBe('FAILED');
    expect(tx?.errorMessage?.toLowerCase()).toContain('abort');

    await prisma.downstreamApi.updateMany({
      where: { orgId },
      data: { timeoutMs: 3000 },
    });
  });

  it('should pass through JEDI as outboundPayload when no active mapping exists', async () => {
    const prisma = getDb();

    await prisma.mapping.updateMany({
      where: { orgId },
      data: { isActive: false },
    });

    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 200, { ok: true });
    server.listen();

    const result = await processInboundJob(
      { rawEdi: RAW_EDI_204, tradingPartnerId, orgId },
      { prisma, queues: { ack997: queue } },
    );

    server.close();

    expect(result.success).toBe(true);

    const tx = await prisma.transaction.findFirst();
    expect(tx?.status).toBe('DELIVERED');
    expect(tx?.outboundPayload).toEqual(tx?.jediPayload);

    await prisma.mapping.updateMany({
      where: { orgId },
      data: { isActive: true },
    });
  });
});
