import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import type { FastifyInstance } from 'fastify';

describe('Trading Partners API', { timeout: 60000 }, () => {
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

  it('POST /api/trading-partners — creates successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/trading-partners',
      payload: { orgId, name: 'ACME Carrier', isaId: 'ACME01', gsId: 'ACME', direction: 'INBOUND' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('ACME Carrier');
    expect(body.isaId).toBe('ACME01');
    expect(body.isActive).toBe(true);
    createdId = body.id;

    const db = await getDb().tradingPartner.findUnique({ where: { id: createdId } });
    expect(db).not.toBeNull();
  });

  it('POST /api/trading-partners — 400 on missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/trading-partners',
      payload: { orgId },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBeTruthy();
  });

  it('GET /api/trading-partners — lists all for org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/trading-partners?orgId=${orgId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/trading-partners/:id — returns single', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/trading-partners/${createdId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(createdId);
  });

  it('GET /api/trading-partners/:id — 404 on missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/trading-partners/nonexistent-id',
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/trading-partners/:id — updates name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/trading-partners/${createdId}`,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated Name');
  });

  it('POST /api/trading-partners — 409 on duplicate isaId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/trading-partners',
      payload: { orgId, name: 'Duplicate', isaId: 'ACME01', gsId: 'ACME2', direction: 'INBOUND' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('ISA ID already exists');
  });

  it('POST /api/trading-partners — includes gsId in response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/trading-partners',
      payload: { orgId, name: 'GS Test', isaId: 'GS01', gsId: 'GSTEST', direction: 'BOTH' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().gsId).toBe('GSTEST');
  });

  it('PATCH /api/trading-partners/:id — partial update', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/trading-partners/${createdId}`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(true);
  });

  it('PATCH /api/trading-partners/:id — activates a deactivated partner', async () => {
    // Deactivate first
    await getDb().tradingPartner.update({ where: { id: createdId }, data: { isActive: false } });
    const before = await getDb().tradingPartner.findUnique({ where: { id: createdId } });
    expect(before?.isActive).toBe(false);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/trading-partners/${createdId}`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isActive).toBe(true);
    expect(body.id).toBe(createdId);
    expect(body.name).toBeTruthy();

    const after = await getDb().tradingPartner.findUnique({ where: { id: createdId } });
    expect(after?.isActive).toBe(true);
  });

  it('PATCH /api/trading-partners/:id — 404 for nonexistent ID', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/trading-partners/nonexistent-id',
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/trading-partners/:id — soft delete', async () => {
    // Re-activate so the delete test works on an active partner
    await getDb().tradingPartner.update({ where: { id: createdId }, data: { isActive: true } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/trading-partners/${createdId}`,
    });
    expect(res.statusCode).toBe(200);
    const db = await getDb().tradingPartner.findUnique({ where: { id: createdId } });
    expect(db?.isActive).toBe(false);
  });
});
