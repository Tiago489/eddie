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

  it('PUT /api/mappings/:id — deactivate with isActive: false', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/mappings/${createdId}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(false);
  });

  it('GET /api/mappings — default returns only active mappings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/mappings?orgId=${orgId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The createdId mapping was deactivated above, so it should not appear
    expect(body.data.every((m: { isActive: boolean }) => m.isActive === true)).toBe(true);
    expect(body.data.find((m: { id: string }) => m.id === createdId)).toBeUndefined();
  });

  it('GET /api/mappings?showAll=true — returns all mappings including inactive', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/mappings?orgId=${orgId}&showAll=true`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.find((m: { id: string }) => m.id === createdId)).toBeDefined();
  });

  it('PUT /api/mappings/:id — rename mapping', async () => {
    // Reactivate first
    await app.inject({ method: 'PUT', url: `/api/mappings/${createdId}`, payload: { isActive: true } });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/mappings/${createdId}`,
      payload: { name: '[Expeditors] 204 INBOUND' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('[Expeditors] 204 INBOUND');
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
