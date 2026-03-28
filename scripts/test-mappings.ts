import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { X12Parser } from '../packages/edi-core/src/index';
import { toJedi, JsonataEvaluator } from '../packages/jedi/src/index';
import { runAllMappingTests, type MappingFixture } from '../packages/jedi/src/mapping-tests/index';

const FIXTURES_DIR = resolve('packages/jedi/src/mapping-tests/fixtures');

function isFixtureDir(dir: string): boolean {
  return existsSync(join(dir, 'input.edi'))
    && existsSync(join(dir, 'expected-output.json'))
    && existsSync(join(dir, 'mapping.jsonata'));
}

function loadFixtures(carrierFilter?: string): MappingFixture[] {
  const fixtures: MappingFixture[] = [];

  // Walk: fixtures/{mappingSlug}/{fixtureName}/ (nested) or fixtures/{name}/ (legacy flat)
  const topDirs = readdirSync(FIXTURES_DIR).filter((d) =>
    statSync(join(FIXTURES_DIR, d)).isDirectory(),
  );

  for (const topDir of topDirs) {
    const topPath = join(FIXTURES_DIR, topDir);

    if (isFixtureDir(topPath)) {
      // Legacy flat layout: fixtures/{name}/input.edi
      const carrier = topDir.split('-')[0].charAt(0).toUpperCase() + topDir.split('-')[0].slice(1);
      if (carrierFilter && carrier.toLowerCase() !== carrierFilter.toLowerCase()) continue;

      fixtures.push({
        name: topDir,
        carrier,
        inputEdi: readFileSync(join(topPath, 'input.edi'), 'utf-8'),
        expectedOutput: JSON.parse(readFileSync(join(topPath, 'expected-output.json'), 'utf-8')),
        jsonataExpression: readFileSync(join(topPath, 'mapping.jsonata'), 'utf-8'),
      });
    } else {
      // Nested layout: fixtures/{mappingSlug}/{fixtureName}/input.edi
      const carrier = topDir.split('-')[0].charAt(0).toUpperCase() + topDir.split('-')[0].slice(1);
      if (carrierFilter && carrier.toLowerCase() !== carrierFilter.toLowerCase()) continue;

      const subDirs = readdirSync(topPath).filter((d) =>
        statSync(join(topPath, d)).isDirectory(),
      );

      for (const subDir of subDirs) {
        const fixturePath = join(topPath, subDir);
        if (!isFixtureDir(fixturePath)) continue;

        fixtures.push({
          name: `${topDir}/${subDir}`,
          carrier,
          inputEdi: readFileSync(join(fixturePath, 'input.edi'), 'utf-8'),
          expectedOutput: JSON.parse(readFileSync(join(fixturePath, 'expected-output.json'), 'utf-8')),
          jsonataExpression: readFileSync(join(fixturePath, 'mapping.jsonata'), 'utf-8'),
        });
      }
    }
  }

  return fixtures;
}

async function updateSnapshots(fixtures: MappingFixture[]): Promise<void> {
  const parser = new X12Parser();
  const eval2 = new JsonataEvaluator();

  for (const fixture of fixtures) {
    const parseResult = parser.parse(fixture.inputEdi);
    if (!parseResult.success) {
      console.error(`  [SKIP] ${fixture.name}: parse failed`);
      continue;
    }
    const jedi = toJedi(parseResult.data);
    if (!jedi.success) {
      console.error(`  [SKIP] ${fixture.name}: JEDI transform failed`);
      continue;
    }
    const result = await eval2.evaluate(fixture.jsonataExpression, jedi.output);
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
