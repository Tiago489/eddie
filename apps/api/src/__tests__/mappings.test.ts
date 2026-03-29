import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as fs from 'fs/promises';
import { setupTestDb, teardownTestDb, getDb } from './helpers/db';
import { createTestApp } from './helpers/app';
import type { FastifyInstance } from 'fastify';

const SAMPLE_EDI = readFileSync(
  resolve(__dirname, '../../../../tests/fixtures/edi/sample_204.edi'),
  'utf-8',
);

const FIXTURES_DIR = resolve(
  process.cwd(),
  'packages/jedi/src/mapping-tests/fixtures',
);

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

  it('PUT /api/mappings/:id — rename moves fixture directory', async () => {
    // Create a mapping with a fixture-compatible expression
    const mapping = await getDb().mapping.create({
      data: {
        orgId,
        name: '[RenameTest] 204 INBOUND',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        jsonataExpression: `{
          "referenceNumber": interchanges[0].functional_groups[0].transaction_sets[0].heading.beginning_segment_for_shipper_order_B2.B2_04_ShipmentIdentificationNumber,
          "carrier": { "scac": interchanges[0].functional_groups[0].transaction_sets[0].heading.beginning_segment_for_shipper_order_B2.B2_02_StandardCarrierAlphaCode },
          "stops": interchanges[0].functional_groups[0].transaction_sets[0].detail.stop_off_details_loop_S5.{ "sequence": stop_off_details_S5.S5_01_StopSequenceNumber }
        }`,
        version: 1,
        isActive: true,
      },
    });

    // Upload a fixture
    const boundary = '----Boundary' + Date.now();
    const body =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="rename-test.edi"\r\nContent-Type: application/octet-stream\r\n\r\n${SAMPLE_EDI}\r\n--${boundary}--\r\n`;
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mapping.id}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(uploadRes.json().success).toBe(true);

    const oldSlug = 'renametest-204-inbound';
    const newSlug = 'renamed-carrier-204-inbound';

    // Verify fixture exists at old path
    const oldDir = resolve(FIXTURES_DIR, oldSlug);
    const entries = await fs.readdir(oldDir);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    // Rename the mapping
    const renameRes = await app.inject({
      method: 'PUT',
      url: `/api/mappings/${mapping.id}`,
      payload: { name: '[Renamed Carrier] 204 INBOUND' },
    });
    expect(renameRes.statusCode).toBe(200);

    // Verify fixtures moved to new path
    const newDir = resolve(FIXTURES_DIR, newSlug);
    const movedEntries = await fs.readdir(newDir);
    expect(movedEntries).toEqual(entries);

    // Verify old path no longer exists
    try {
      await fs.access(oldDir);
      expect.fail('Old fixture directory should not exist after rename');
    } catch {
      // Expected
    }

    // GET fixtures should still return them
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/mappings/${mapping.id}/fixtures`,
    });
    expect(getRes.json().fixtures.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await fs.rm(newDir, { recursive: true });
    await getDb().mapping.delete({ where: { id: mapping.id } });
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
