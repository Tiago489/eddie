import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import { decrypt } from '../lib/crypto';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';

describe('SFTP Connections API', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let tradingPartnerId: string;
  let createdId: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
    await setupTestDb();
    app = createTestApp(getDb());
    const org = await getDb().organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;
    const tp = await getDb().tradingPartner.create({
      data: { orgId, name: 'TP', isaId: 'TP01', direction: 'INBOUND', isActive: true },
    });
    tradingPartnerId = tp.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('POST /api/sftp-connections — creates with encrypted password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sftp-connections',
      payload: {
        tradingPartnerId,
        host: 'sftp.example.com',
        port: 22,
        username: 'ediuser',
        password: 'secret123',
        remotePath: '/inbound',
        archivePath: '/archive',
        pollingIntervalSeconds: 300,
        filePattern: '*.edi',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.password).toBeUndefined();
    expect(body.encryptedPassword).toBeUndefined();
    createdId = body.id;

    const db = await getDb().sftpConnection.findUnique({ where: { id: createdId } });
    expect(db?.encryptedPassword).not.toBe('secret123');
    expect(decrypt(db!.encryptedPassword)).toBe('secret123');
  });

  it('GET /api/sftp-connections/:id — no password in response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sftp-connections/${createdId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.password).toBeUndefined();
    expect(body.encryptedPassword).toBeUndefined();
  });

  it('PUT /api/sftp-connections/:id — re-encrypts password', async () => {
    const oldDb = await getDb().sftpConnection.findUnique({ where: { id: createdId } });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/sftp-connections/${createdId}`,
      payload: { password: 'newpassword' },
    });
    expect(res.statusCode).toBe(200);
    const newDb = await getDb().sftpConnection.findUnique({ where: { id: createdId } });
    expect(newDb?.encryptedPassword).not.toBe(oldDb?.encryptedPassword);
    expect(decrypt(newDb!.encryptedPassword)).toBe('newpassword');
  });

  it('DELETE /api/sftp-connections/:id — soft delete', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/sftp-connections/${createdId}`,
    });
    expect(res.statusCode).toBe(200);
    const db = await getDb().sftpConnection.findUnique({ where: { id: createdId } });
    expect(db?.isActive).toBe(false);
  });
});
