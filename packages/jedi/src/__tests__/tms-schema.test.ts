import { describe, it, expect } from 'vitest';
import { deriveSchemaFromFixtures, defaultTmsSchema } from '../tms-schema';
import { validateTmsOutput } from '../output-validator';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';

// Find the fixtures directory the same way tms-schema.ts does
function findFixturesDir(): string {
  const candidates = [
    resolve(process.cwd(), 'packages/jedi/src/mapping-tests/fixtures'),
    resolve(process.cwd(), 'apps/api/packages/jedi/src/mapping-tests/fixtures'),
    resolve(__dirname, '../mapping-tests/fixtures'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0];
}

function loadPassingStediFixtures(): Array<{ name: string; output: Record<string, unknown> }> {
  const fixturesDir = findFixturesDir();
  const results: Array<{ name: string; output: Record<string, unknown> }> = [];
  if (!existsSync(fixturesDir)) return results;

  for (const mappingSlug of readdirSync(fixturesDir)) {
    const mappingDir = join(fixturesDir, mappingSlug);
    if (!statSync(mappingDir).isDirectory()) continue;
    for (const fixtureName of readdirSync(mappingDir)) {
      const fixtureDir = join(mappingDir, fixtureName);
      if (!statSync(fixtureDir).isDirectory()) continue;
      const metaPath = join(fixtureDir, 'meta.json');
      const expectedPath = join(fixtureDir, 'expected-output.json');
      if (!existsSync(metaPath) || !existsSync(expectedPath)) continue;
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        if (meta.source !== 'stedi' || !meta.lastTestPassed) continue;
        const output = JSON.parse(readFileSync(expectedPath, 'utf-8'));
        results.push({ name: `${mappingSlug}/${fixtureName}`, output });
      } catch { continue; }
    }
  }
  return results;
}

describe('TMS schema derivation', () => {
  const derived = deriveSchemaFromFixtures();
  const fixtures = loadPassingStediFixtures();

  it('should derive a schema when passing stedi fixtures exist', () => {
    if (fixtures.length === 0) return; // skip in CI with no fixtures
    expect(derived).not.toBeNull();
    expect(derived!.required.length).toBeGreaterThan(0);
  });

  it('derived required fields should be present in every passing fixture', () => {
    if (!derived || fixtures.length === 0) return;

    for (const fixture of fixtures) {
      const result = validateTmsOutput(fixture.output, {
        required: derived.required,
        optional: [],
        noExtraFields: false,
      });
      if (!result.valid) {
        expect.fail(
          `Fixture "${fixture.name}" is missing derived required fields: ${result.errors.join(', ')}`,
        );
      }
    }
  });

  it('derived optional fields should NOT be present in every fixture', () => {
    if (!derived || fixtures.length === 0 || derived.optional.length === 0) return;

    // At least one optional field should be missing from at least one fixture
    let foundMissing = false;
    for (const optField of derived.optional) {
      for (const fixture of fixtures) {
        const result = validateTmsOutput(fixture.output, {
          required: [optField],
          optional: [],
          noExtraFields: false,
        });
        if (!result.valid) {
          foundMissing = true;
          break;
        }
      }
      if (foundMissing) break;
    }
    expect(foundMissing).toBe(true);
  });

  it('defaultTmsSchema should match the derived schema', () => {
    if (!derived) return;
    expect(defaultTmsSchema.required).toEqual(derived.required);
    expect(defaultTmsSchema.optional).toEqual(derived.optional);
  });
});

// ─── Sentinel: snapshot of empirically derived required fields ───
// If this test fails, a fixture was added/changed that shifted the required fields.
// Review the diff: if the new fields are correct, update the snapshot below.
describe('TMS schema drift sentinel', () => {
  // Fields present in 100% of passing fixtures (6 fixtures: 3x 211, 3x 204).
  // Updated 2026-03-28: added 204 fixtures, narrowed required set.
  const SNAPSHOT_REQUIRED = [
    'consigneeInformation',
    'consigneeInformation.addressLine1',
    'consigneeInformation.city',
    'consigneeInformation.country',
    'consigneeInformation.name',
    'consigneeInformation.state',
    'consigneeInformation.zip',
    'order',
    'order.deadlineDate',
    'order.endStop',
    'order.endStop.specialInstructions',
    'order.paymentMethod',
    'order.pickupOrDelivery',
    'order.secondaryRefNumber',
    'order.standardOrderFields',
    'order.standardOrderFields.shipperBillOfLadingNumber',
    'packages',
    'packages[].description',
    'packages[].quantity',
    'receiverId',
    'senderId',
    'shipperInformation',
    'shipperInformation.addressLine1',
    'shipperInformation.city',
    'shipperInformation.contactName',
    'shipperInformation.country',
    'shipperInformation.name',
    'shipperInformation.state',
    'shipperInformation.zip',
    'standardCarrierAlphaCode',
    'transactionSetIdentifierCode',
    'transactionSetPurposeCode',
    'usageIndicatorCode',
  ];

  const SNAPSHOT_OPTIONAL = [
    'applicationSenderCode',
    'consigneeInformation.addressLine2',
    'consigneeInformation.contactName',
    'consigneeInformation.contactPhone',
    'order.equipmentType',
    'order.mawb',
    'order.quaternaryRefNumber',
    'order.quinaryRefNumber',
    'order.tertiaryRefNumber',
    'packages[].height',
    'packages[].length',
    'packages[].packageType',
    'packages[].weight',
    'packages[].width',
    'senderContactCode',
    'shipperInformation.addressLine2',
    'shipperInformation.contactPhone',
  ];

  it('required fields should match snapshot (update if intentional)', () => {
    const derived = deriveSchemaFromFixtures();
    if (!derived) return; // skip in CI with no fixtures

    const added = derived.required.filter((f) => !SNAPSHOT_REQUIRED.includes(f));
    const removed = SNAPSHOT_REQUIRED.filter((f) => !derived.required.includes(f));

    if (added.length > 0 || removed.length > 0) {
      const msg = [
        'TMS required fields have drifted from snapshot.',
        added.length > 0 ? `  Added (new universal fields): ${added.join(', ')}` : '',
        removed.length > 0 ? `  Removed (no longer in all fixtures): ${removed.join(', ')}` : '',
        'If this is intentional, update SNAPSHOT_REQUIRED in tms-schema.test.ts.',
      ].filter(Boolean).join('\n');
      expect.fail(msg);
    }
  });

  it('optional fields should match snapshot (update if intentional)', () => {
    const derived = deriveSchemaFromFixtures();
    if (!derived) return;

    const added = derived.optional.filter((f) => !SNAPSHOT_OPTIONAL.includes(f));
    const removed = SNAPSHOT_OPTIONAL.filter((f) => !derived.optional.includes(f));

    if (added.length > 0 || removed.length > 0) {
      const msg = [
        'TMS optional fields have drifted from snapshot.',
        added.length > 0 ? `  Added: ${added.join(', ')}` : '',
        removed.length > 0 ? `  Removed: ${removed.join(', ')}` : '',
        'If this is intentional, update SNAPSHOT_OPTIONAL in tms-schema.test.ts.',
      ].filter(Boolean).join('\n');
      expect.fail(msg);
    }
  });
});
