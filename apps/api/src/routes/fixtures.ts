import { FastifyInstance } from 'fastify';
import { X12Parser } from '@edi-platform/edi-core';
import {
  toJedi, JsonataEvaluator, validateTmsOutput, defaultTmsSchema,
  runMappingTest, type MappingFixture,
} from '@edi-platform/jedi';
import * as fs from 'fs/promises';
import * as path from 'path';

const parser = new X12Parser();
const evaluator = new JsonataEvaluator();

const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'packages/jedi/src/mapping-tests/fixtures',
);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[([^\]]+)\]/g, '$1')  // [Carrier] → carrier
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanum → dash
    .replace(/^-+|-+$/g, '');        // trim dashes
}

interface FixtureInfo {
  name: string;
  inputEdiPreview: string;
  lastTestedAt: string;
  lastTestPassed: boolean;
}

export async function fixturesRoutes(app: FastifyInstance) {
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // POST /api/mappings/:id/fixtures — upload EDI file, create fixture
  app.post('/:id/fixtures', async (request, reply) => {
    const { id } = request.params as { id: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const buffer = await file.toBuffer();
    const ediContent = buffer.toString('utf-8').trim();

    if (!ediContent.startsWith('ISA')) {
      return reply.status(400).send({
        success: false,
        error: 'File does not appear to be valid EDI — must start with ISA segment',
        code: 'INVALID_ISA_ENVELOPE',
      });
    }

    // Step 1: Parse EDI → JEDI
    const parseResult = parser.parse(ediContent);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: `EDI parse failed: ${parseResult.error}`,
        code: parseResult.code,
      });
    }

    const jediResult = toJedi(parseResult.data);
    if (!jediResult.success) {
      return reply.status(400).send({
        success: false,
        error: `JEDI transform failed: ${jediResult.error}`,
      });
    }

    // Step 2: Evaluate mapping
    const mapResult = await evaluator.evaluate<unknown>(
      mapping.jsonataExpression,
      jediResult.output,
    );
    if (!mapResult.success) {
      return reply.send({
        success: false,
        error: `Mapping evaluation failed: ${mapResult.error}`,
        expression: mapResult.expression,
      });
    }

    // Step 3: Validate output
    const validation = validateTmsOutput(mapResult.output, defaultTmsSchema);
    const warnings: string[] = [];
    if (!validation.valid) {
      warnings.push(...validation.errors);
    }

    // Step 4: Save fixture
    const fixtureSlug = slugify(mapping.name);
    const fixtureDir = path.join(FIXTURES_DIR, fixtureSlug);
    await fs.mkdir(fixtureDir, { recursive: true });

    await Promise.all([
      fs.writeFile(path.join(fixtureDir, 'input.edi'), ediContent),
      fs.writeFile(
        path.join(fixtureDir, 'expected-output.json'),
        JSON.stringify(mapResult.output, null, 2) + '\n',
      ),
      fs.writeFile(path.join(fixtureDir, 'mapping.jsonata'), mapping.jsonataExpression),
    ]);

    // Step 5: Run the test to confirm it passes
    const fixture: MappingFixture = {
      name: fixtureSlug,
      carrier: mapping.name.match(/\[([^\]]+)\]/)?.[1] ?? 'Unknown',
      inputEdi: ediContent,
      expectedOutput: mapResult.output,
      jsonataExpression: mapping.jsonataExpression,
    };

    const testResult = await runMappingTest(fixture);

    return reply.send({
      success: true,
      fixture: fixtureSlug,
      testResult: testResult.pass
        ? { pass: true, durationMs: testResult.durationMs }
        : { pass: false, errors: testResult.errors },
      warnings,
    });
  });

  // GET /api/mappings/:id/fixtures — list fixtures for this mapping
  app.get('/:id/fixtures', async (request, reply) => {
    const { id } = request.params as { id: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const fixtureSlug = slugify(mapping.name);

    try {
      const entries = await fs.readdir(FIXTURES_DIR);
      const fixtures: FixtureInfo[] = [];

      for (const entry of entries) {
        // Match fixtures for this mapping by slug prefix
        if (!entry.startsWith(fixtureSlug.split('-')[0])) {
          // Broader match: check if this fixture's mapping.jsonata matches
          const jsonataPath = path.join(FIXTURES_DIR, entry, 'mapping.jsonata');
          try {
            const expr = await fs.readFile(jsonataPath, 'utf-8');
            if (expr !== mapping.jsonataExpression) continue;
          } catch {
            continue;
          }
        }

        const fixtureDir = path.join(FIXTURES_DIR, entry);
        const stat = await fs.stat(fixtureDir);
        if (!stat.isDirectory()) continue;

        try {
          const ediContent = await fs.readFile(path.join(fixtureDir, 'input.edi'), 'utf-8');
          const expectedOutput = JSON.parse(
            await fs.readFile(path.join(fixtureDir, 'expected-output.json'), 'utf-8'),
          );
          const jsonataExpression = await fs.readFile(path.join(fixtureDir, 'mapping.jsonata'), 'utf-8');

          const fixture: MappingFixture = {
            name: entry,
            carrier: mapping.name.match(/\[([^\]]+)\]/)?.[1] ?? 'Unknown',
            inputEdi: ediContent,
            expectedOutput,
            jsonataExpression,
          };

          const testResult = await runMappingTest(fixture);

          fixtures.push({
            name: entry,
            inputEdiPreview: ediContent.substring(0, 100),
            lastTestedAt: new Date().toISOString(),
            lastTestPassed: testResult.pass,
          });
        } catch {
          // Skip fixtures with missing files
        }
      }

      return reply.send({ fixtures });
    } catch {
      return reply.send({ fixtures: [] });
    }
  });

  // DELETE /api/mappings/:id/fixtures/:fixtureName — remove fixture
  app.delete('/:id/fixtures/:fixtureName', async (request, reply) => {
    const { id, fixtureName } = request.params as { id: string; fixtureName: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const fixtureDir = path.join(FIXTURES_DIR, fixtureName);

    try {
      await fs.access(fixtureDir);
    } catch {
      return reply.status(404).send({ error: 'Fixture not found' });
    }

    await fs.rm(fixtureDir, { recursive: true });
    return reply.send({ success: true });
  });
}
