import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { X12Parser } from '../packages/edi-core/src/index';
import { toJedi204, JsonataEvaluator } from '../packages/jedi/src/index';
import { runAllMappingTests, type MappingFixture } from '../packages/jedi/src/mapping-tests/index';

const FIXTURES_DIR = resolve('packages/jedi/src/mapping-tests/fixtures');

function loadFixtures(carrierFilter?: string): MappingFixture[] {
  const fixtures: MappingFixture[] = [];
  const dirs = readdirSync(FIXTURES_DIR).filter((d) =>
    statSync(join(FIXTURES_DIR, d)).isDirectory(),
  );

  for (const dir of dirs) {
    const fixtureDir = join(FIXTURES_DIR, dir);
    const inputEdi = readFileSync(join(fixtureDir, 'input.edi'), 'utf-8');
    const expectedOutput = JSON.parse(readFileSync(join(fixtureDir, 'expected-output.json'), 'utf-8'));
    const jsonataExpression = readFileSync(join(fixtureDir, 'mapping.jsonata'), 'utf-8');

    // Extract carrier from dir name: "expeditors-204-inbound" → "Expeditors"
    const carrier = dir.split('-')[0].charAt(0).toUpperCase() + dir.split('-')[0].slice(1);

    if (carrierFilter && carrier.toLowerCase() !== carrierFilter.toLowerCase()) continue;

    fixtures.push({
      name: dir,
      carrier,
      inputEdi,
      expectedOutput,
      jsonataExpression,
    });
  }

  return fixtures;
}

async function updateSnapshots(fixtures: MappingFixture[]): Promise<void> {
  const parser = new X12Parser();
  const evaluator = new JsonataEvaluator();

  for (const fixture of fixtures) {
    const parseResult = parser.parse(fixture.inputEdi);
    if (!parseResult.success) {
      console.error(`  [SKIP] ${fixture.name}: parse failed`);
      continue;
    }
    const jedi = toJedi204(parseResult.data);
    if (!jedi.success) {
      console.error(`  [SKIP] ${fixture.name}: JEDI transform failed`);
      continue;
    }
    const result = await evaluator.evaluate(fixture.jsonataExpression, jedi.output);
    if (!result.success) {
      console.error(`  [SKIP] ${fixture.name}: mapping failed`);
      continue;
    }
    const outputPath = join(FIXTURES_DIR, fixture.name, 'expected-output.json');
    writeFileSync(outputPath, JSON.stringify(result.output, null, 2) + '\n');
    console.log(`  [UPDATED] ${fixture.name}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isUpdate = args.includes('--update');
  const carrierArg = args.find((a: string) => a.startsWith('--carrier='));
  const carrierFilter = carrierArg?.split('=')[1];

  const fixtures = loadFixtures(carrierFilter);

  if (fixtures.length === 0) {
    console.log('No fixtures found' + (carrierFilter ? ` for carrier: ${carrierFilter}` : ''));
    process.exit(0);
  }

  if (isUpdate) {
    console.log('Updating snapshots...');
    await updateSnapshots(fixtures);
    console.log('Done.');
    process.exit(0);
  }

  console.log(`Running ${fixtures.length} mapping tests...\n`);
  const results = await runAllMappingTests(fixtures);

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    if (r.pass) {
      console.log(`  [PASS] ${r.carrier} / ${r.name} (${r.durationMs}ms)`);
      passed++;
    } else {
      console.log(`  [FAIL] ${r.carrier} / ${r.name}`);
      for (const err of r.errors) {
        console.log(`         ${err}`);
      }
      if (r.diff) {
        console.log(`         Diff:\n${r.diff.split('\n').map((l) => `           ${l}`).join('\n')}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Mapping test runner failed:', e);
  process.exit(1);
});
