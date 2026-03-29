import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runMappingTest, runAllMappingTests, type MappingFixture } from '../mapping-tests/index';

const SAMPLE_EDI = readFileSync(
  resolve(__dirname, '../../../../tests/fixtures/edi/sample_204.edi'),
  'utf-8',
);

const SIMPLE_MAPPING = `{
  "referenceNumber": $$.transactionSets[0].heading.beginning_segment_for_shipment_information_transaction_B2.shipment_identification_number_04,
  "carrier": {
    "scac": $$.transactionSets[0].heading.beginning_segment_for_shipment_information_transaction_B2.standard_carrier_alpha_code_02
  },
  "stops": $$.transactionSets[0].detail.stop_off_details_S5_loop.{
    "sequence": stop_off_details_S5.stop_sequence_number_01
  }
}`;

const EXPECTED_OUTPUT = {
  referenceNumber: 'SH12345',
  carrier: { scac: 'SCAC' },
  stops: [{ sequence: '1' }, { sequence: '2' }],
};

describe('mapping-tests runner', () => {
  it('should pass when fixture output matches expected', async () => {
    const fixture: MappingFixture = {
      name: 'test-pass',
      carrier: 'TestCarrier',
      inputEdi: SAMPLE_EDI,
      expectedOutput: EXPECTED_OUTPUT,
      jsonataExpression: SIMPLE_MAPPING,
    };

    const result = await runMappingTest(fixture);
    expect(result.pass).toBe(true);
    if (result.pass) {
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('should fail with diff when output does not match expected', async () => {
    const fixture: MappingFixture = {
      name: 'test-mismatch',
      carrier: 'TestCarrier',
      inputEdi: SAMPLE_EDI,
      expectedOutput: { referenceNumber: 'WRONG', carrier: { scac: 'SCAC' }, stops: [] },
      jsonataExpression: SIMPLE_MAPPING,
    };

    const result = await runMappingTest(fixture);
    expect(result.pass).toBe(false);
    if (!result.pass) {
      expect(result.errors).toContain('Output does not match expected');
      expect(result.diff).toBeTruthy();
      expect(result.diff).toContain('WRONG');
    }
  });

  it('should fail clearly on parse error', async () => {
    const fixture: MappingFixture = {
      name: 'test-bad-edi',
      carrier: 'TestCarrier',
      inputEdi: 'NOT~VALID~EDI',
      expectedOutput: {},
      jsonataExpression: '$$',
    };

    const result = await runMappingTest(fixture);
    expect(result.pass).toBe(false);
    if (!result.pass) {
      expect(result.errors[0]).toContain('Parse failed');
    }
  });

  it('should fail clearly on mapping evaluation error', async () => {
    const fixture: MappingFixture = {
      name: 'test-bad-expr',
      carrier: 'TestCarrier',
      inputEdi: SAMPLE_EDI,
      expectedOutput: {},
      jsonataExpression: '$badFn(',
    };

    const result = await runMappingTest(fixture);
    expect(result.pass).toBe(false);
    if (!result.pass) {
      expect(result.errors[0]).toContain('Mapping evaluation failed');
    }
  });

  it('should fail when output does not match expected', async () => {
    const fixture: MappingFixture = {
      name: 'test-mismatch-expected',
      carrier: 'TestCarrier',
      inputEdi: SAMPLE_EDI,
      expectedOutput: { wrong: 'shape' },
      jsonataExpression: '{ "partial": true }',
    };

    const result = await runMappingTest(fixture);
    expect(result.pass).toBe(false);
    if (!result.pass) {
      expect(result.errors.some((e) => e.includes('Output does not match expected'))).toBe(true);
    }
  });

  it('should run multiple fixtures and return correct counts', async () => {
    const passing: MappingFixture = {
      name: 'multi-pass',
      carrier: 'Alpha',
      inputEdi: SAMPLE_EDI,
      expectedOutput: EXPECTED_OUTPUT,
      jsonataExpression: SIMPLE_MAPPING,
    };

    const failing: MappingFixture = {
      name: 'multi-fail',
      carrier: 'Beta',
      inputEdi: 'INVALID',
      expectedOutput: {},
      jsonataExpression: '$$',
    };

    const results = await runAllMappingTests([passing, failing]);
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.pass)).toHaveLength(1);
    expect(results.filter((r) => !r.pass)).toHaveLength(1);
    expect(results[0].carrier).toBe('Alpha');
    expect(results[1].carrier).toBe('Beta');
  });

  it('should load and pass the real expeditors-204-inbound fixture', async () => {
    const fixtureDir = resolve(__dirname, '../mapping-tests/fixtures/expeditors-204-inbound/sample-204');
    const fixture: MappingFixture = {
      name: 'expeditors-204-inbound/sample-204',
      carrier: 'Expeditors',
      inputEdi: readFileSync(resolve(fixtureDir, 'input.edi'), 'utf-8'),
      expectedOutput: JSON.parse(readFileSync(resolve(fixtureDir, 'expected-output.json'), 'utf-8')),
      jsonataExpression: readFileSync(resolve(fixtureDir, 'mapping.jsonata'), 'utf-8'),
    };

    const result = await runMappingTest(fixture);
    expect(result.pass).toBe(true);
    if (result.pass) {
      expect(result.carrier).toBe('Expeditors');
    }
  });
});
