import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createMockApi } from './helpers/mock-api';
import { processOutboundJob } from '../jobs/process-outbound.job';

const jedi204 = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../tests/fixtures/jedi/expected_204_jedi.json'), 'utf-8'),
);

describe('processOutboundJob', { timeout: 60000 }, () => {
  let orgId: string;
  let tradingPartnerId: string;
  let downstreamApiId: string;

  beforeAll(async () => {
    const prisma = await setupTestDb();

    const org = await prisma.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const tp = await prisma.tradingPartner.create({
      data: {
        orgId,
        name: 'Test Partner',
        isaId: 'SHIPPER',
        isActive: true,
        direction: 'OUTBOUND',
      },
    });
    tradingPartnerId = tp.id;

    const api = await prisma.downstreamApi.create({
      data: {
        orgId,
        name: 'Test API',
        baseUrl: 'http://mock-outbound.test',
        authType: 'NONE',
        timeoutMs: 3000,
      },
    });
    downstreamApiId = api.id;

    await prisma.mapping.create({
      data: {
        orgId,
        name: 'Identity 990',
        transactionSet: 'EDI_990',
        direction: 'OUTBOUND',
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

  it('should generate 990 EDI and deliver to downstream', async () => {
    const server = createMockApi('http://mock-outbound.test', 200, { ok: true });
    server.listen();

    const result = await processOutboundJob(
      {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_990',
        payload: jedi204,
      },
      { prisma: getDb(), queues: {} as Record<string, never> },
    );

    server.close();

    expect(result.success).toBe(true);

    const tx = await getDb().transaction.findFirst();
    expect(tx?.status).toBe('DELIVERED');
    expect(tx?.rawEdi).toContain('ST*990');
  });

  it('should mark FAILED on bad JSONata mapping expression', async () => {
    const prisma = getDb();

    await prisma.mapping.updateMany({
      where: { orgId, transactionSet: 'EDI_990' },
      data: { jsonataExpression: '$invalid$$(' },
    });

    const result = await processOutboundJob(
      {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_990',
        payload: jedi204,
      },
      { prisma, queues: {} as Record<string, never> },
    );

    expect(result.success).toBe(false);

    const tx = await prisma.transaction.findFirst();
    expect(tx?.status).toBe('FAILED');
    expect(tx?.errorMessage).toBeTruthy();

    await prisma.mapping.updateMany({
      where: { orgId, transactionSet: 'EDI_990' },
      data: { jsonataExpression: '$$' },
    });
  });

  it('should fail on unsupported transaction set', async () => {
    const result = await processOutboundJob(
      {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_999',
        payload: jedi204,
      },
      { prisma: getDb(), queues: {} as Record<string, never> },
    );

    expect(result.success).toBe(false);

    const tx = await getDb().transaction.findFirst();
    expect(tx?.status).toBe('FAILED');
    expect(tx?.errorMessage?.toLowerCase()).toMatch(/unsupported|999/);
  });

  it('should fail when no downstream API is configured', async () => {
    const prisma = getDb();

    await prisma.downstreamApi.deleteMany({ where: { orgId } });

    const result = await processOutboundJob(
      {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_990',
        payload: jedi204,
      },
      { prisma, queues: {} as Record<string, never> },
    );

    expect(result.success).toBe(false);

    const tx = await prisma.transaction.findFirst();
    expect(tx?.status).toBe('FAILED');
    expect(tx?.errorMessage?.toLowerCase()).toMatch(/downstream|api/);

    // Restore
    const api = await prisma.downstreamApi.create({
      data: {
        orgId,
        name: 'Test API',
        baseUrl: 'http://mock-outbound.test',
        authType: 'NONE',
        timeoutMs: 3000,
      },
    });
    downstreamApiId = api.id;
  });

  it('should generate 214 EDI', async () => {
    const server = createMockApi('http://mock-outbound.test', 200, { ok: true });
    server.listen();

    // Need an outbound 214 mapping
    await getDb().mapping.create({
      data: {
        orgId,
        name: 'Identity 214',
        transactionSet: 'EDI_214',
        direction: 'OUTBOUND',
        jsonataExpression: '$$',
        version: 1,
        isActive: true,
      },
    });

    const result = await processOutboundJob(
      {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_214',
        payload: jedi204,
        options: { statusCode: 'AF', statusReason: 'AA' },
      },
      { prisma: getDb(), queues: {} as Record<string, never> },
    );

    server.close();

    expect(result.success).toBe(true);

    const tx = await getDb().transaction.findFirst();
    expect(tx?.rawEdi).toContain('ST*214');
  });
});
