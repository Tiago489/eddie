import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import { createMockQueue } from './helpers/mock-queue';
import type { FastifyInstance } from 'fastify';

describe('Outbound API', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let tradingPartnerId: string;
  let queue: ReturnType<typeof createMockQueue>;

  beforeAll(async () => {
    await setupTestDb();
    const prisma = getDb();
    const org = await prisma.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;
    const tp = await prisma.tradingPartner.create({
      data: { orgId, name: 'TP', isaId: 'TP01', direction: 'OUTBOUND', isActive: true },
    });
    tradingPartnerId = tp.id;
    queue = createMockQueue();
    app = createTestApp(prisma, { 'outbound-edi': queue });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('POST /api/outbound/EDI_990 — enqueues to outbound-edi', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/EDI_990',
      payload: { orgId, tradingPartnerId, payload: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.queued).toBe(true);
    expect(queue.jobs.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/outbound/EDI_INVALID — 400 on unknown set', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/outbound/EDI_INVALID',
      payload: { orgId, tradingPartnerId, payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});
