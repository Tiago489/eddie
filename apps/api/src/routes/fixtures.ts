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
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

interface FixtureMeta {
  source: 'stedi' | 'generated';
  uploadedAt: string;
}

async function readMeta(fixtureDir: string): Promise<FixtureMeta> {
  try {
    const raw = await fs.readFile(path.join(fixtureDir, 'meta.json'), 'utf-8');
    return JSON.parse(raw) as FixtureMeta;
  } catch {
    return { source: 'generated', uploadedAt: '' };
  }
}

interface FixtureInfo {
  name: string;
  source: 'stedi' | 'generated';
  inputEdiPreview: string;
  lastTestedAt: string;
  lastTestPassed: boolean;
}

export async function fixturesRoutes(app: FastifyInstance) {
  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // POST /api/mappings/:id/fixtures — upload EDI file (+ optional paired JSON)
  app.post('/:id/fixtures', async (request, reply) => {
    const { id } = request.params as { id: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    // Consume all uploaded files
    const parts = request.parts();
    let ediContent: string | null = null;
    let ediFilename = '';
    let pairedJson: unknown = null;

    for await (const part of parts) {
      if (part.type !== 'file') continue;
      const buf = await part.toBuffer();
      const content = buf.toString('utf-8').trim();

      if (part.filename.endsWith('.json')) {
        try {
          pairedJson = JSON.parse(content);
        } catch {
          return reply.status(400).send({
            success: false,
            error: 'Paired JSON file contains invalid JSON',
            code: 'INVALID_JSON',
          });
        }
      } else {
        // Treat any non-.json file as EDI input
        ediContent = content;
        ediFilename = part.filename;
      }
    }

    if (!ediContent) {
      return reply.status(400).send({ error: 'No .edi file uploaded' });
    }

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

    // Step 2: Evaluate mapping (always run, even with paired JSON)
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

    // Determine source and expected output
    const source: FixtureMeta['source'] = pairedJson !== null ? 'stedi' : 'generated';
    const expectedOutput = pairedJson ?? mapResult.output;

    // Step 4: Save fixture
    const mappingSlug = slugify(mapping.name);
    let fixtureName = slugify(ediFilename.replace(/\.edi$/i, ''));
    if (!fixtureName) fixtureName = 'fixture';

    const mappingDir = path.join(FIXTURES_DIR, mappingSlug);
    let fixtureDir = path.join(mappingDir, fixtureName);

    if (await dirExists(fixtureDir)) {
      fixtureName = `${fixtureName}-${Date.now()}`;
      fixtureDir = path.join(mappingDir, fixtureName);
    }

    await fs.mkdir(fixtureDir, { recursive: true });

    const meta: FixtureMeta = { source, uploadedAt: new Date().toISOString() };

    await Promise.all([
      fs.writeFile(path.join(fixtureDir, 'input.edi'), ediContent),
      fs.writeFile(
        path.join(fixtureDir, 'expected-output.json'),
        JSON.stringify(expectedOutput, null, 2) + '\n',
      ),
      fs.writeFile(path.join(fixtureDir, 'mapping.jsonata'), mapping.jsonataExpression),
      fs.writeFile(path.join(fixtureDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n'),
    ]);

    // Step 5: Run the test
    const fixture: MappingFixture = {
      name: fixtureName,
      carrier: mapping.name.match(/\[([^\]]+)\]/)?.[1] ?? 'Unknown',
      inputEdi: ediContent,
      expectedOutput,
      jsonataExpression: mapping.jsonataExpression,
    };

    const testResult = await runMappingTest(fixture);

    return reply.send({
      success: true,
      fixture: fixtureName,
      source,
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

    const mappingSlug = slugify(mapping.name);
    const mappingDir = path.join(FIXTURES_DIR, mappingSlug);

    if (!(await dirExists(mappingDir))) {
      return reply.send({ fixtures: [] });
    }

    const fixtures: FixtureInfo[] = [];
    const entries = await fs.readdir(mappingDir);

    for (const entry of entries) {
      const fixtureDir = path.join(mappingDir, entry);
      const stat = await fs.stat(fixtureDir);
      if (!stat.isDirectory()) continue;

      try {
        const ediContent = await fs.readFile(path.join(fixtureDir, 'input.edi'), 'utf-8');
        const expectedOutput = JSON.parse(
          await fs.readFile(path.join(fixtureDir, 'expected-output.json'), 'utf-8'),
        );
        const jsonataExpression = await fs.readFile(path.join(fixtureDir, 'mapping.jsonata'), 'utf-8');
        const meta = await readMeta(fixtureDir);

        const fixtureData: MappingFixture = {
          name: entry,
          carrier: mapping.name.match(/\[([^\]]+)\]/)?.[1] ?? 'Unknown',
          inputEdi: ediContent,
          expectedOutput,
          jsonataExpression,
        };

        const testResult = await runMappingTest(fixtureData);

        fixtures.push({
          name: entry,
          source: meta.source,
          inputEdiPreview: ediContent.substring(0, 100),
          lastTestedAt: new Date().toISOString(),
          lastTestPassed: testResult.pass,
        });
      } catch {
        // Skip fixtures with missing files
      }
    }

    return reply.send({ fixtures });
  });

  // DELETE /api/mappings/:id/fixtures/:fixtureName
  app.delete('/:id/fixtures/:fixtureName', async (request, reply) => {
    const { id, fixtureName } = request.params as { id: string; fixtureName: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const mappingSlug = slugify(mapping.name);
    const fixtureDir = path.join(FIXTURES_DIR, mappingSlug, fixtureName);

    if (!(await dirExists(fixtureDir))) {
      return reply.status(404).send({ error: 'Fixture not found' });
    }

    await fs.rm(fixtureDir, { recursive: true });
    return reply.send({ success: true });
  });
}
