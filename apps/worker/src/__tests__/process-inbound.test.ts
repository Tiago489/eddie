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

  it('should deliver successfully even when mapping produces non-standard output shape', async () => {
    const prisma = getDb();

    await prisma.mapping.updateMany({
      where: { orgId },
      data: { isActive: false },
    });
    await prisma.mapping.create({
      data: {
        orgId,
        name: 'Minimal Output',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        jsonataExpression: '{ "partialField": "value" }',
        version: 1,
        isActive: true,
      },
    });

    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 200, { ok: true });
    server.listen();

    const result = await processInboundJob(
      { rawEdi: RAW_EDI_204, tradingPartnerId, orgId },
      { prisma, queues: { ack997: queue } },
    );

    server.close();

    // Validation is advisory — transaction should still deliver
    expect(result.success).toBe(true);
    const tx = await prisma.transaction.findFirst();
    expect(tx?.status).toBe('DELIVERED');
    expect(tx?.outboundPayload).toEqual({ partialField: 'value' });

    await prisma.mapping.deleteMany({ where: { orgId, name: 'Minimal Output' } });
    await prisma.mapping.updateMany({
      where: { orgId },
      data: { isActive: true },
    });
  });

  it('should prefer partner-specific mapping over generic org mapping', async () => {
    const prisma = getDb();

    // Create a partner-specific mapping that returns a distinct shape
    const partnerMapping = await prisma.mapping.create({
      data: {
        orgId,
        tradingPartnerId,
        name: 'Partner-specific 204',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        jsonataExpression: '{ "partnerSpecific": true, "from": "partner-mapping" }',
        version: 1,
        isActive: true,
      },
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
    expect(tx?.outboundPayload).toEqual({ partnerSpecific: true, from: 'partner-mapping' });

    await prisma.mapping.delete({ where: { id: partnerMapping.id } });
  });

  it('should fall back to generic mapping when no partner-specific mapping exists', async () => {
    const prisma = getDb();

    // Create a second trading partner with NO partner-specific mapping
    const tp2 = await prisma.tradingPartner.create({
      data: { orgId, name: 'Other Partner', isaId: 'OTHER01', isActive: true, direction: 'INBOUND' },
    });

    const queue = createMockQueue();
    const server = createMockApi('http://mock-api.test', 200, { ok: true });
    server.listen();

    // Process with tp2 — should use the generic (no tradingPartnerId) mapping
    const result = await processInboundJob(
      { rawEdi: RAW_EDI_204, tradingPartnerId: tp2.id, orgId },
      { prisma, queues: { ack997: queue } },
    );

    server.close();

    expect(result.success).toBe(true);

    const tx = await prisma.transaction.findFirst({ orderBy: { createdAt: 'desc' } });
    // The generic "Identity 204" mapping returns $$ (the full JEDI), so outbound === jedi
    expect(tx?.outboundPayload).toEqual(tx?.jediPayload);

    // Cleanup: delete transaction first (FK constraint), then partner
    await prisma.transactionEvent.deleteMany({ where: { transaction: { tradingPartnerId: tp2.id } } });
    await prisma.transaction.deleteMany({ where: { tradingPartnerId: tp2.id } });
    await prisma.tradingPartner.delete({ where: { id: tp2.id } });
  });
});
