/**
 * EDI Partner Map Validation Pipeline
 *
 * Runs every configured transform against test fixtures,
 * diffs actual vs expected, and reports mismatches.
 *
 * Usage: npx tsx scripts/validate-maps.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { X12Parser } from '../packages/edi-core/src/parser/x12-parser';
import { toJedi204, toJedi997 } from '../packages/jedi/src/transforms/to-jedi';
import { fromJedi990, fromJedi214, fromJedi210 } from '../packages/jedi/src/transforms/from-jedi';
import type { JediDocument } from '../packages/jedi/src/types/jedi';

const FIXTURES = resolve(__dirname, '../tests/fixtures');
const parser = new X12Parser();

interface ValidationResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  error?: string;
  diff?: string;
}

const results: ValidationResult[] = [];

function diffObjects(expected: unknown, actual: unknown, path = ''): string[] {
  const diffs: string[] = [];
  if (typeof expected !== typeof actual) {
    diffs.push(`${path}: type mismatch — expected ${typeof expected}, got ${typeof actual}`);
    return diffs;
  }
  if (expected === null || actual === null) {
    if (expected !== actual) diffs.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return diffs;
  }
  if (typeof expected !== 'object') {
    if (expected !== actual) diffs.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return diffs;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) { diffs.push(`${path}: expected array, got object`); return diffs; }
    if (expected.length !== (actual as unknown[]).length) diffs.push(`${path}: array length — expected ${expected.length}, got ${(actual as unknown[]).length}`);
    for (let i = 0; i < Math.max(expected.length, (actual as unknown[]).length); i++) {
      diffs.push(...diffObjects(expected[i], (actual as unknown[])[i], `${path}[${i}]`));
    }
    return diffs;
  }
  const expKeys = new Set(Object.keys(expected as Record<string, unknown>));
  const actKeys = new Set(Object.keys(actual as Record<string, unknown>));
  for (const k of expKeys) {
    if (!actKeys.has(k)) { diffs.push(`${path}.${k}: missing in actual`); continue; }
    diffs.push(...diffObjects((expected as Record<string, unknown>)[k], (actual as Record<string, unknown>)[k], `${path}.${k}`));
  }
  for (const k of actKeys) {
    if (!expKeys.has(k)) diffs.push(`${path}.${k}: unexpected key in actual`);
  }
  return diffs;
}

// ─── Inbound: EDI → JEDI ───

function validateInbound(name: string, ediFile: string, expectedJsonFile: string, transform: typeof toJedi204) {
  if (!existsSync(ediFile)) { results.push({ name, status: 'SKIP', error: `Missing fixture: ${ediFile}` }); return; }
  if (!existsSync(expectedJsonFile)) { results.push({ name, status: 'SKIP', error: `Missing fixture: ${expectedJsonFile}` }); return; }

  const raw = readFileSync(ediFile, 'utf-8');
  const expected = JSON.parse(readFileSync(expectedJsonFile, 'utf-8'));

  const parseResult = parser.parse(raw);
  if (!parseResult.success) {
    results.push({ name, status: 'FAIL', error: `Parse failed: ${parseResult.error} [${parseResult.code}]` });
    return;
  }

  const mapResult = transform(parseResult.data);
  if (!mapResult.success) {
    results.push({ name, status: 'FAIL', error: `Transform failed: ${mapResult.error}` });
    return;
  }

  const diffs = diffObjects(expected, mapResult.output);
  if (diffs.length > 0) {
    // Write actual output for debugging
    const actualFile = expectedJsonFile.replace('expected_', 'actual_');
    writeFileSync(actualFile, JSON.stringify(mapResult.output, null, 2));
    results.push({ name, status: 'FAIL', diff: diffs.join('\n') });
  } else {
    results.push({ name, status: 'PASS' });
  }
}

// ─── Outbound: JEDI → EDI ───

function validateOutbound(
  name: string,
  jediInputFile: string,
  transform: (doc: JediDocument, opts?: Record<string, unknown>) => { success: boolean; output?: string; error?: string },
  opts?: Record<string, unknown>,
) {
  if (!existsSync(jediInputFile)) { results.push({ name, status: 'SKIP', error: `Missing fixture: ${jediInputFile}` }); return; }

  const jediDoc = JSON.parse(readFileSync(jediInputFile, 'utf-8')) as JediDocument;
  const result = transform(jediDoc, opts as never);

  if (!result.success) {
    results.push({ name, status: 'FAIL', error: `Transform failed: ${result.error}` });
    return;
  }

  // Verify generated EDI is parseable
  const parseResult = parser.parse(result.output!);
  if (!parseResult.success) {
    results.push({ name, status: 'FAIL', error: `Generated EDI failed to parse: ${parseResult.error}` });
    return;
  }

  results.push({ name, status: 'PASS' });
}

// ─── Run all validations ───

console.log('EDI Partner Map Validation Pipeline');
console.log('===================================\n');

// Inbound transforms
console.log('--- Inbound: EDI -> JEDI ---');
validateInbound(
  'toJedi204 (sample_204.edi)',
  resolve(FIXTURES, 'edi/sample_204.edi'),
  resolve(FIXTURES, 'jedi/expected_204_jedi.json'),
  toJedi204,
);

validateInbound(
  'toJedi997 (sample_997.edi)',
  resolve(FIXTURES, 'edi/sample_997.edi'),
  resolve(FIXTURES, 'jedi/expected_997_jedi.json'),
  toJedi997,
);

// Outbound transforms
console.log('--- Outbound: JEDI -> EDI ---');
const jedi204Path = resolve(FIXTURES, 'jedi/expected_204_jedi.json');

validateOutbound('fromJedi990 (accept)', jedi204Path, fromJedi990 as never);
validateOutbound('fromJedi990 (decline)', jedi204Path, (doc: JediDocument) => fromJedi990(doc, { acceptCode: 'D' }) as never);
validateOutbound('fromJedi214 (AF/AA)', jedi204Path, (doc: JediDocument) => fromJedi214(doc, { statusCode: 'AF', statusReason: 'AA' }) as never);
validateOutbound('fromJedi214 (X3/NS)', jedi204Path, (doc: JediDocument) => fromJedi214(doc, { statusCode: 'X3', statusReason: 'NS' }) as never);
validateOutbound('fromJedi210 (invoice)', jedi204Path, (doc: JediDocument) => fromJedi210(doc, { invoiceNumber: 'INV-001', totalCharges: 1500 }) as never);
validateOutbound('fromJedi210 (zero charges)', jedi204Path, (doc: JediDocument) => fromJedi210(doc, { invoiceNumber: 'INV-002', totalCharges: 0 }) as never);

// Edge case fixtures — additional 204 variants
console.log('--- Edge Case Fixtures ---');

// Minimal 204 (no stops, no L11, no G62, no N1)
const minEdiPath = resolve(FIXTURES, 'edi/edge_204_minimal.edi');
if (existsSync(minEdiPath)) {
  const raw = readFileSync(minEdiPath, 'utf-8');
  const pr = parser.parse(raw);
  if (!pr.success) {
    results.push({ name: 'edge_204_minimal: parse', status: 'FAIL', error: pr.error });
  } else {
    const jr = toJedi204(pr.data);
    if (!jr.success) {
      results.push({ name: 'edge_204_minimal: toJedi204', status: 'FAIL', error: jr.error });
    } else {
      // Verify structure
      const ts = (jr.output as JediDocument).interchanges[0].functional_groups[0].transaction_sets[0] as Record<string, unknown>;
      const detail = ts.detail as { stop_off_details_loop_S5: unknown[] };
      if (detail.stop_off_details_loop_S5.length === 0) {
        results.push({ name: 'edge_204_minimal: empty stops', status: 'PASS' });
      } else {
        results.push({ name: 'edge_204_minimal: empty stops', status: 'FAIL', error: 'Expected 0 stops' });
      }
      // Save golden file for future runs
      const goldenPath = resolve(FIXTURES, 'jedi/expected_204_minimal_jedi.json');
      if (!existsSync(goldenPath)) {
        writeFileSync(goldenPath, JSON.stringify(jr.output, null, 2));
        console.log(`  [NEW] Generated golden file: ${goldenPath}`);
      }
    }
  }
}

// Multi-stop 204 (3 stops)
const multiEdiPath = resolve(FIXTURES, 'edi/edge_204_many_stops.edi');
if (existsSync(multiEdiPath)) {
  const raw = readFileSync(multiEdiPath, 'utf-8');
  const pr = parser.parse(raw);
  if (!pr.success) {
    results.push({ name: 'edge_204_many_stops: parse', status: 'FAIL', error: pr.error });
  } else {
    const jr = toJedi204(pr.data);
    if (!jr.success) {
      results.push({ name: 'edge_204_many_stops: toJedi204', status: 'FAIL', error: jr.error });
    } else {
      const ts = (jr.output as JediDocument).interchanges[0].functional_groups[0].transaction_sets[0] as Record<string, unknown>;
      const detail = ts.detail as { stop_off_details_loop_S5: unknown[] };
      if (detail.stop_off_details_loop_S5.length === 3) {
        results.push({ name: 'edge_204_many_stops: 3 stops', status: 'PASS' });
      } else {
        results.push({ name: 'edge_204_many_stops: 3 stops', status: 'FAIL', error: `Expected 3 stops, got ${detail.stop_off_details_loop_S5.length}` });
      }
      // Round-trip: generate 990 from multi-stop
      const rt = fromJedi990(jr.output);
      if (rt.success) {
        const rtParse = parser.parse(rt.output!);
        if (rtParse.success && rtParse.data.transactionSetId === '990') {
          results.push({ name: 'edge_204_many_stops: round-trip 990', status: 'PASS' });
        } else {
          results.push({ name: 'edge_204_many_stops: round-trip 990', status: 'FAIL', error: 'Generated 990 failed to parse' });
        }
      } else {
        results.push({ name: 'edge_204_many_stops: round-trip 990', status: 'FAIL', error: rt.error });
      }
      // Save golden file
      const goldenPath = resolve(FIXTURES, 'jedi/expected_204_many_stops_jedi.json');
      if (!existsSync(goldenPath)) {
        writeFileSync(goldenPath, JSON.stringify(jr.output, null, 2));
        console.log(`  [NEW] Generated golden file: ${goldenPath}`);
      }
    }
  }
}

// Validation checks
console.log('--- Validation Checks ---');

// 204 with missing B2
const minimalParsed = {
  isaControlNumber: '000000001',
  gsControlNumber: '1',
  transactionSetId: '204',
  segments: [] as string[][],
  transactionSegments: [{ id: 'L11', elements: ['L11', 'REF', 'SI'] }],
};
const b2Missing = toJedi204(minimalParsed);
if (!b2Missing.success && b2Missing.error.includes('B2')) {
  results.push({ name: 'toJedi204 rejects missing B2', status: 'PASS' });
} else {
  results.push({ name: 'toJedi204 rejects missing B2', status: 'FAIL', error: 'Should fail when B2 is missing' });
}

// 990 with missing shipment ID
const jedi204 = JSON.parse(readFileSync(jedi204Path, 'utf-8'));
const noShipment = JSON.parse(JSON.stringify(jedi204));
delete noShipment.interchanges[0].functional_groups[0].transaction_sets[0]
  .heading.beginning_segment_for_shipper_order_B2.B2_04_ShipmentIdentificationNumber;
const noShipResult = fromJedi990(noShipment);
if (!noShipResult.success && noShipResult.error.toLowerCase().includes('shipment')) {
  results.push({ name: 'fromJedi990 rejects missing shipment ID', status: 'PASS' });
} else {
  results.push({ name: 'fromJedi990 rejects missing shipment ID', status: 'FAIL', error: 'Should fail when shipment ID missing' });
}

// ─── Report ───

console.log('\n===================================');
console.log('RESULTS\n');

const passed = results.filter(r => r.status === 'PASS');
const failed = results.filter(r => r.status === 'FAIL');
const skipped = results.filter(r => r.status === 'SKIP');

for (const r of results) {
  const icon = r.status === 'PASS' ? 'PASS' : r.status === 'FAIL' ? 'FAIL' : 'SKIP';
  console.log(`  [${icon}] ${r.name}`);
  if (r.error) console.log(`         ${r.error}`);
  if (r.diff) {
    const lines = r.diff.split('\n');
    for (const line of lines.slice(0, 10)) console.log(`         ${line}`);
    if (lines.length > 10) console.log(`         ... and ${lines.length - 10} more diffs`);
  }
}

console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
console.log('===================================');

if (failed.length > 0) process.exit(1);
