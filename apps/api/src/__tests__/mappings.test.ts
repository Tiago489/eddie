import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import type { FastifyInstance } from 'fastify';

describe('Mappings API', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let createdId: string;

  beforeAll(async () => {
    await setupTestDb();
    app = createTestApp(getDb());
    const org = await getDb().organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('POST /api/mappings — creates with JSONata expression', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mappings',
      payload: {
        orgId,
        name: 'Test Mapping',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        jsonataExpression: '{ "id": shipmentId }',
        version: 1,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().isActive).toBe(true);
    createdId = res.json().id;
  });

  it('GET /api/mappings — filter by transactionSet', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/mappings?orgId=${orgId}&transactionSet=EDI_204`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((m: { transactionSet: string }) => m.transactionSet === 'EDI_204')).toBe(true);
  });

  it('POST /api/mappings/:id/test — runs mapping against input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${createdId}/test`,
      payload: { input: { shipmentId: 'SHIP001' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.output.id).toBe('SHIP001');
  });

  it('POST /api/mappings/:id/test — bad JSONata returns error', async () => {
    // Create a mapping with bad expression
    const bad = await getDb().mapping.create({
      data: {
        orgId,
        name: 'Bad Mapping',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        jsonataExpression: '$invalid$$(',
        version: 1,
        isActive: true,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${bad.id}/test`,
      payload: { input: { test: true } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});
