import { FastifyInstance } from 'fastify';
import { X12Parser } from '@edi-platform/edi-core';
import {
  toJedi, JsonataEvaluator, validateTmsOutput, defaultTmsSchema,
  runMappingTest, type MappingFixture,
  learnFromFixture, addEntries, refreshTmsSchema,
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

function extractCarrier(mappingName: string): string {
  return mappingName.match(/\[([^\]]+)\]/)?.[1] ?? 'Unknown';
}

interface FixtureMeta {
  source: 'stedi' | 'generated';
  uploadedAt: string;
  lastTestPassed: boolean;
}

async function readMeta(fixtureDir: string): Promise<FixtureMeta> {
  try {
    const raw = await fs.readFile(path.join(fixtureDir, 'meta.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FixtureMeta>;
    return {
      source: parsed.source ?? 'generated',
      uploadedAt: parsed.uploadedAt ?? '',
      lastTestPassed: parsed.lastTestPassed ?? false,
    };
  } catch {
    return { source: 'generated', uploadedAt: '', lastTestPassed: false };
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

  app.post('/:id/fixtures', async (request, reply) => {
    const { id } = request.params as { id: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

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

    const mapResult = await evaluator.evaluate<unknown>(
      mapping.jsonataExpression,
      jediResult.output,
    );
    if (!mapResult.success) {
      return reply.status(422).send({
        success: false,
        error: `Mapping evaluation failed: ${mapResult.error}`,
        expression: mapResult.expression,
      });
    }

    const validation = validateTmsOutput(mapResult.output, defaultTmsSchema);
    const warnings: string[] = [];
    if (!validation.valid) {
      warnings.push(...validation.errors);
    }

    const source: FixtureMeta['source'] = pairedJson !== null ? 'stedi' : 'generated';
    const expectedOutput = pairedJson ?? mapResult.output;

    const mappingSlug = slugify(mapping.name);
    let fixtureName = slugify(ediFilename.replace(/\.edi$/i, ''));
    if (!fixtureName) fixtureName = 'fixture';

    const mappingDir = path.join(FIXTURES_DIR, mappingSlug);
    await fs.mkdir(mappingDir, { recursive: true });
    let fixtureDir = path.join(mappingDir, fixtureName);

    try {
      await fs.mkdir(fixtureDir);
    } catch {
      fixtureName = `${fixtureName}-${Date.now()}`;
      fixtureDir = path.join(mappingDir, fixtureName);
      await fs.mkdir(fixtureDir);
    }

    const outputMatches = JSON.stringify(mapResult.output) === JSON.stringify(expectedOutput);
    // For stedi ground truth: pass if output matches (validation is advisory only)
    // For generated: pass if output matches AND validation passes
    const testPass = source === 'stedi' ? outputMatches : (outputMatches && validation.valid);

    const meta: FixtureMeta = { source, uploadedAt: new Date().toISOString(), lastTestPassed: testPass };

    await Promise.all([
      fs.writeFile(path.join(fixtureDir, 'input.edi'), ediContent),
      fs.writeFile(
        path.join(fixtureDir, 'expected-output.json'),
        JSON.stringify(expectedOutput, null, 2) + '\n',
      ),
      fs.writeFile(path.join(fixtureDir, 'mapping.jsonata'), mapping.jsonataExpression),
      fs.writeFile(path.join(fixtureDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n'),
    ]);

    // Refresh TMS schema from all fixtures so new ground truth is incorporated
    if (source === 'stedi' && testPass) {
      refreshTmsSchema();
    }

    let learnedCount = 0;
    if (source === 'stedi' && typeof mapResult.output === 'object' && mapResult.output !== null) {
      const learned = learnFromFixture(
        mapResult.output as Record<string, unknown>,
        expectedOutput as Record<string, unknown>,
      );
      if (learned.length > 0) {
        addEntries(learned);
        learnedCount = learned.length;
        for (const { table, entry } of learned) {
          warnings.push(`Learned lookup: ${table} "${entry.Key}" → "${entry.Value}"`);
        }
      }
    }

    return reply.send({
      success: true,
      fixture: fixtureName,
      source,
      learnedEntries: learnedCount,
      testResult: testPass
        ? { pass: true, durationMs: 0 }
        : { pass: false, errors: outputMatches ? validation.errors : ['Output does not match expected'] },
      warnings,
    });
  });

  app.get('/:id/fixtures', async (request, reply) => {
    const { id } = request.params as { id: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const mappingSlug = slugify(mapping.name);
    const mappingDir = path.join(FIXTURES_DIR, mappingSlug);

    let entries: string[];
    try {
      entries = await fs.readdir(mappingDir);
    } catch {
      return reply.send({ fixtures: [] });
    }

    const fixtures = await Promise.all(
      entries.map(async (entry): Promise<FixtureInfo | null> => {
        const fixtureDir = path.join(mappingDir, entry);
        try {
          const stat = await fs.stat(fixtureDir);
          if (!stat.isDirectory()) return null;

          const [ediContent, meta] = await Promise.all([
            fs.readFile(path.join(fixtureDir, 'input.edi'), 'utf-8'),
            readMeta(fixtureDir),
          ]);

          return {
            name: entry,
            source: meta.source,
            inputEdiPreview: ediContent.substring(0, 100),
            lastTestedAt: meta.uploadedAt || new Date().toISOString(),
            lastTestPassed: meta.lastTestPassed,
          };
        } catch {
          return null;
        }
      }),
    );

    return reply.send({
      fixtures: fixtures.filter((f): f is FixtureInfo => f !== null),
    });
  });

  app.delete('/:id/fixtures/:fixtureName', async (request, reply) => {
    const { id, fixtureName } = request.params as { id: string; fixtureName: string };

    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const mappingSlug = slugify(mapping.name);
    const fixtureDir = path.join(FIXTURES_DIR, mappingSlug, fixtureName);

    try {
      await fs.rm(fixtureDir, { recursive: true });
      return reply.send({ success: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return reply.status(404).send({ error: 'Fixture not found' });
      }
      throw err;
    }
  });
}
