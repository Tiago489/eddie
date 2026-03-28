import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
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
  const createdFixtureDirs: string[] = [];

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
    // Clean up created fixture directories
    for (const dir of createdFixtureDirs) {
      try {
        await fs.rm(dir, { recursive: true });
      } catch { /* ignore */ }
    }
    await teardownTestDb();
  });

  it('POST /api/mappings/:id/fixtures — upload valid EDI creates fixture', async () => {
    const { body, boundary } = buildMultipartPayload('test.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.fixture).toBeTruthy();
    expect(json.testResult.pass).toBe(true);

    // Track for cleanup
    createdFixtureDirs.push(resolve(FIXTURES_DIR, json.fixture));

    // Verify files were written
    const fixtureDir = resolve(FIXTURES_DIR, json.fixture);
    const inputEdi = await fs.readFile(resolve(fixtureDir, 'input.edi'), 'utf-8');
    expect(inputEdi).toBe(SAMPLE_EDI.trim());
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
    const json = res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe('INVALID_ISA_ENVELOPE');
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

  it('GET /api/mappings/:id/fixtures — returns list of fixtures', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/mappings/${mappingId}/fixtures`,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Array.isArray(json.fixtures)).toBe(true);
    // Should have the fixture we created above
    expect(json.fixtures.length).toBeGreaterThanOrEqual(1);
    const fixture = json.fixtures[0];
    expect(fixture.name).toBeTruthy();
    expect(fixture.inputEdiPreview).toBeTruthy();
    expect(typeof fixture.lastTestPassed).toBe('boolean');
  });

  it('DELETE /api/mappings/:id/fixtures/:fixtureName — removes fixture', async () => {
    // First create a fixture to delete
    const { body, boundary } = buildMultipartPayload('delete-test.edi', SAMPLE_EDI);
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

    // Verify directory is gone
    try {
      await fs.access(resolve(FIXTURES_DIR, fixtureName));
      expect.fail('Fixture directory should have been deleted');
    } catch {
      // Expected — directory doesn't exist
    }
  });
});
