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

function buildMultipartPayload(files: Array<{ name: string; filename: string; content: string }>) {
  const boundary = '----TestBoundary' + Date.now();
  let body = '';
  for (const file of files) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`;
    body += `Content-Type: application/octet-stream\r\n`;
    body += `\r\n`;
    body += `${file.content}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { body, boundary };
}

function singleEdi(filename: string, content: string) {
  return buildMultipartPayload([{ name: 'file', filename, content }]);
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
    for (const name of createdFixtureNames) {
      try { await fs.rm(resolve(FIXTURES_DIR, mappingSlug, name), { recursive: true }); } catch { /* ignore */ }
    }
    try {
      const entries = await fs.readdir(resolve(FIXTURES_DIR, mappingSlug));
      if (entries.length === 0) await fs.rmdir(resolve(FIXTURES_DIR, mappingSlug));
    } catch { /* ignore */ }
    await teardownTestDb();
  });

  // --- Single .edi upload (existing behaviour) ---

  it('POST single .edi — creates fixture with source=generated and meta.json', async () => {
    const { body, boundary } = singleEdi('shipment-001.edi', SAMPLE_EDI);

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
    expect(json.source).toBe('generated');
    expect(json.testResult.pass).toBe(true);

    createdFixtureNames.push(json.fixture);

    // Verify meta.json
    const metaPath = resolve(FIXTURES_DIR, mappingSlug, json.fixture, 'meta.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    expect(meta.source).toBe('generated');
    expect(meta.uploadedAt).toBeTruthy();
  });

  // --- Paired upload (.edi + .json) ---

  it('POST paired .edi + .json — saves Stedi output as expected, source=stedi', async () => {
    const stediOutput = { orderId: 'STEDI-123', carrier: 'FWDA', matched: true };
    const { body, boundary } = buildMultipartPayload([
      { name: 'file', filename: 'NWKD_204.edi', content: SAMPLE_EDI },
      { name: 'file', filename: 'NWKD_204.json', content: JSON.stringify(stediOutput) },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.source).toBe('stedi');

    createdFixtureNames.push(json.fixture);

    // Verify expected-output.json contains the Stedi output, NOT the mapping output
    const expectedPath = resolve(FIXTURES_DIR, mappingSlug, json.fixture, 'expected-output.json');
    const saved = JSON.parse(await fs.readFile(expectedPath, 'utf-8'));
    expect(saved).toEqual(stediOutput);

    // Verify meta.json
    const metaPath = resolve(FIXTURES_DIR, mappingSlug, json.fixture, 'meta.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    expect(meta.source).toBe('stedi');
  });

  // --- Paired upload with invalid JSON ---

  it('POST paired .edi + invalid .json — returns 400', async () => {
    const { body, boundary } = buildMultipartPayload([
      { name: 'file', filename: 'bad-pair.edi', content: SAMPLE_EDI },
      { name: 'file', filename: 'bad-pair.json', content: '{ not valid json!!!' },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_JSON');
  });

  // --- Multiple fixtures + duplicate handling ---

  it('POST second upload creates separate fixture', async () => {
    const { body, boundary } = singleEdi('shipment-002.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().fixture).toBe('shipment-002');
    createdFixtureNames.push(res.json().fixture);
  });

  it('POST duplicate filename gets timestamp suffix', async () => {
    const { body, boundary } = singleEdi('shipment-001.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().fixture).toMatch(/^shipment-001-\d+$/);
    createdFixtureNames.push(res.json().fixture);
  });

  // --- Error cases ---

  it('POST invalid file (not EDI) returns 400', async () => {
    const { body, boundary } = singleEdi('bad.txt', 'This is not EDI');

    const res = await app.inject({
      method: 'POST',
      url: `/api/mappings/${mappingId}/fixtures`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_ISA_ENVELOPE');
  });

  it('POST non-existent mapping returns 404', async () => {
    const { body, boundary } = singleEdi('test.edi', SAMPLE_EDI);

    const res = await app.inject({
      method: 'POST',
      url: '/api/mappings/nonexistent-id/fixtures',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(404);
  });

  // --- GET with source field ---

  it('GET returns fixtures with correct source field', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/mappings/${mappingId}/fixtures`,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.fixtures.length).toBeGreaterThanOrEqual(3);

    // Check that source field is present on all fixtures
    for (const f of json.fixtures as Array<{ source: string }>) {
      expect(['stedi', 'generated']).toContain(f.source);
    }

    // The paired upload fixture should have source=stedi
    const stediFixture = json.fixtures.find((f: { name: string }) => f.name.startsWith('nwkd-204'));
    expect(stediFixture?.source).toBe('stedi');

    // The single upload fixture should have source=generated
    const generatedFixture = json.fixtures.find((f: { name: string }) => f.name === 'shipment-001');
    expect(generatedFixture?.source).toBe('generated');
  });

  // --- DELETE ---

  it('DELETE removes specific fixture only', async () => {
    const { body, boundary } = singleEdi('to-delete.edi', SAMPLE_EDI);
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

    const remaining = await fs.readdir(resolve(FIXTURES_DIR, mappingSlug));
    expect(remaining.length).toBeGreaterThanOrEqual(1);
  });
});
