import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import type { FastifyInstance } from 'fastify';

describe('Wizard API', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let downstreamApiId: string;

  const SAMPLE_EDI = `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>~
GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010~
ST*204*0001~
B2**SCAC**SH12345***PP~
L11*REF123*SI~
SE*4*0001~
GE*1*1~
IEA*1*000000001~`;

  beforeAll(async () => {
    await setupTestDb();
    const prisma = getDb();
    const org = await prisma.organization.create({ data: { name: 'Wizard Test Org' } });
    orgId = org.id;

    const tp = await prisma.tradingPartner.create({
      data: { orgId, name: 'Test TP', isaId: 'TP01', direction: 'INBOUND', isActive: true },
    });

    const api = await prisma.downstreamApi.create({
      data: { orgId, name: 'Test API', baseUrl: 'http://mock-wizard.test', authType: 'NONE', timeoutMs: 3000 },
    });
    downstreamApiId = api.id;

    app = createTestApp(prisma);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('POST /api/wizard/parse', () => {
    it('should parse valid EDI and return JEDI', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/wizard/parse',
        payload: { rawEdi: SAMPLE_EDI, orgId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.transactionSet).toBe('204');
      expect(body.segmentCount).toBeGreaterThan(0);
      expect(body.jedi).toBeTruthy();
      expect(body.jedi.interchanges).toBeInstanceOf(Array);
    });

    it('should return error for invalid EDI', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/wizard/parse',
        payload: { rawEdi: 'NOT VALID EDI', orgId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeTruthy();
      expect(body.code).toBeTruthy();
    });

    it('should return 400 for missing rawEdi', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/wizard/parse',
        payload: { orgId },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/wizard/send', () => {
    it('should create transaction and deliver to downstream', async () => {
      // First parse to get JEDI
      const parseRes = await app.inject({
        method: 'POST',
        url: '/api/wizard/parse',
        payload: { rawEdi: SAMPLE_EDI, orgId },
      });
      const { jedi } = parseRes.json();

      // Note: this will fail to actually deliver since mock-wizard.test doesn't exist
      // but it should still create the transaction
      const res = await app.inject({
        method: 'POST',
        url: '/api/wizard/send',
        payload: { jedi, mappingId: null, downstreamApiId, orgId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.transactionId).toBeTruthy();

      // Verify transaction was created in DB
      const tx = await getDb().transaction.findUnique({ where: { id: body.transactionId } });
      expect(tx).not.toBeNull();
      expect(tx?.jediPayload).not.toBeNull();
    });

    it('should return 404 for unknown downstream API', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/wizard/send',
        payload: { jedi: { interchanges: [] }, mappingId: null, downstreamApiId: 'nonexistent', orgId },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
