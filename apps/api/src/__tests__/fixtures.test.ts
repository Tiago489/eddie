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

function buildMultipartPayload(filename: string, content: string) {
  const boundary = '----TestBoundary' + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n` +
    `\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return { body, boundary };
}

describe('Fixtures API', { timeout: 60000 }, () => {
  let app: FastifyInstance;
  let orgId: string;
  let mappingId: string;
  const mappingSlug = 'testcarrier-204-inbound';
  const createdFixtureNames: string[] = [];

  beforeAll(async () => {
    await setupTestDb();
    app = createTestApp(getDb());
    const org = await getDb().organization.create({ data: { name: 'Fixture Test Org' } });
    orgId = org.id;

    const mapping = await getDb().mapping.create({
      data: {
        orgId,
        name: '[TestCarrier] 204 INBOUND',
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
    mappingId = mapping.id;
  });

  afterAll(async () => {
    // Clean up created fixture subdirectories
    for (const name of createdFixtureNames) {
      try {
        await fs.rm(resolve(FIXTURES_DIR, mappingSlug, name), { recursive: true });
      } catch { /* ignore */ }
    }
    // Remove mapping dir if empty
    try {
      const entries = await fs.readdir(resolve(FIXTURES_DIR, mappingSlug));
      if (entries.length === 0) await fs.rmdir(resolve(FIXTURES_DIR, mappingSlug));
    } catch { /* ignore */ }
    await teardownTestDb();
  });

  it('POST /api/mappings/:id/fixtures — upload valid EDI creates fixture in nested dir', async () => {
    const { body, boundary } = buildMultipartPayload('shipment-001.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.fixture).toBe('shipment-001');
    expect(json.testResult.pass).toBe(true);

    createdFixtureNames.push(json.fixture);

    // Verify nested structure: {mappingSlug}/{fixtureName}/input.edi
    const fixtureDir = resolve(FIXTURES_DIR, mappingSlug, json.fixture);
    const inputEdi = await fs.readFile(resolve(fixtureDir, 'input.edi'), 'utf-8');
    expect(inputEdi).toBe(SAMPLE_EDI.trim());
  });

  it('POST /api/mappings/:id/fixtures — second upload creates separate fixture', async () => {
    const { body, boundary } = buildMultipartPayload('shipment-002.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.fixture).toBe('shipment-002');

    createdFixtureNames.push(json.fixture);

    // Both fixtures should exist
    const dir1 = resolve(FIXTURES_DIR, mappingSlug, 'shipment-001');
    const dir2 = resolve(FIXTURES_DIR, mappingSlug, 'shipment-002');
    await fs.access(dir1);
    await fs.access(dir2);
  });

  it('POST /api/mappings/:id/fixtures — duplicate filename gets timestamp suffix', async () => {
    const { body, boundary } = buildMultipartPayload('shipment-001.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    // Should NOT be "shipment-001" since that already exists
    expect(json.fixture).not.toBe('shipment-001');
    expect(json.fixture).toMatch(/^shipment-001-\d+$/);

    createdFixtureNames.push(json.fixture);
  });

  it('POST /api/mappings/:id/fixtures — invalid file (not EDI) returns 400', async () => {
    const { body, boundary } = buildMultipartPayload('bad.txt', 'This is not EDI data at all');

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_ISA_ENVELOPE');
  });

  it('POST /api/mappings/:id/fixtures — non-existent mapping returns 404', async () => {
    const { body, boundary } = buildMultipartPayload('test.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: '/api/mappings/nonexistent-id/fixtures',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /api/mappings/:id/fixtures — returns all fixtures for this mapping', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/mappings/${mappingId}/fixtures`,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.fixtures)).toBe(true);
    // Should have at least the 3 fixtures we created above
    expect(json.fixtures.length).toBeGreaterThanOrEqual(3);
    const names = json.fixtures.map((f: { name: string }) => f.name);
    expect(names).toContain('shipment-001');
    expect(names).toContain('shipment-002');
  });

  it('DELETE /api/mappings/:id/fixtures/:fixtureName — removes specific fixture only', async () => {
    const { body, boundary } = buildMultipartPayload('to-delete.edi', SAMPLE_EDI);
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    const fixtureName = createRes.json().fixture;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/mappings/${mappingId}/fixtures/${fixtureName}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify specific fixture dir is gone
    const gone = resolve(FIXTURES_DIR, mappingSlug, fixtureName);
    try {
      await fs.access(gone);
      expect.fail('Fixture directory should have been deleted');
    } catch {
      // Expected
    }

    // Other fixtures should still exist
    const remaining = await fs.readdir(resolve(FIXTURES_DIR, mappingSlug));
    expect(remaining.length).toBeGreaterThanOrEqual(1);
  });
});
