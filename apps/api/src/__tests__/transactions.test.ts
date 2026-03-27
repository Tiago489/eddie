import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import { createMockQueue } from './helpers/mock-queue';
import type { FastifyInstance } from 'fastify';

describe('Transactions API', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let tradingPartnerId: string;
  let failedTxId: string;

  beforeAll(async () => {
    await setupTestDb();
    const prisma = getDb();
    const org = await prisma.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;
    const tp = await prisma.tradingPartner.create({
      data: { orgId, name: 'TP', isaId: 'TP01', direction: 'INBOUND', isActive: true },
    });
    tradingPartnerId = tp.id;

    const statuses = ['DELIVERED', 'DELIVERED', 'FAILED', 'FAILED', 'DUPLICATE'] as const;
    for (let i = 0; i < statuses.length; i++) {
      const tx = await prisma.transaction.create({
        data: {
          orgId,
          tradingPartnerId,
          transactionSet: 'EDI_204',
          direction: 'INBOUND',
          status: statuses[i],
          isaControlNumber: `00000000${i}`,
          contentHash: `hash${i}`,
          rawEdi: `ISA*test*${i}~`,
        },
      });
      if (statuses[i] === 'FAILED' && !failedTxId) failedTxId = tx.id;
    }

    const queue = createMockQueue();
    app = createTestApp(prisma, { 'inbound-edi': queue });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('GET /api/transactions — returns paginated list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/transactions?orgId=${orgId}&page=1&limit=10`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBe(5);
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
  });

  it('GET /api/transactions — filter by status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/transactions?orgId=${orgId}&status=FAILED&page=1&limit=10`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
  });

  it('GET /api/transactions/:id — returns full transaction', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/transactions/${failedTxId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(failedTxId);
    expect(body.rawEdi).toBeTruthy();
  });

  it('GET /api/transactions/:id — 404 on missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/transactions/nonexistent-id',
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/transactions/:id/reprocess — enqueues to inbound-edi', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/transactions/${failedTxId}/reprocess`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transactionId).toBe(failedTxId);
    expect(body.queued).toBe(true);
  });
});
