import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import { decrypt } from '../lib/crypto';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';

describe('Downstream APIs', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let createdId: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString('hex');
    await setupTestDb();
    app = createTestApp(getDb());
    const org = await getDb().organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('POST /api/downstream-apis — creates with encrypted credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/downstream-apis',
      payload: {
        orgId,
        name: 'Test API',
        baseUrl: 'https://api.example.com',
        authType: 'API_KEY',
        credentials: 'my-secret-key',
        timeoutMs: 5000,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.credentials).toBeUndefined();
    expect(body.encryptedCredentials).toBeUndefined();
    createdId = body.id;

    const db = await getDb().downstreamApi.findUnique({ where: { id: createdId } });
    expect(db?.encryptedCredentials).not.toBe('my-secret-key');
    expect(decrypt(db!.encryptedCredentials!)).toBe('my-secret-key');
  });

  it('GET /api/downstream-apis — lists for org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/downstream-apis?orgId=${orgId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].encryptedCredentials).toBeUndefined();
  });

  it('DELETE /api/downstream-apis/:id — deletes', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/downstream-apis/${createdId}`,
    });
    expect(res.statusCode).toBe(200);
  });
});
