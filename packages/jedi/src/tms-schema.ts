import * as fs from 'fs';
import * as path from 'path';

export interface TmsOutputSchema {
  required: string[];
  optional: string[];
  noExtraFields: boolean;
}

function collectPaths(obj: unknown, prefix = ''): Set<string> {
  const paths = new Set<string>();
  if (obj === null || obj === undefined || typeof obj !== 'object') return paths;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      for (const p of collectPaths(item, `${prefix}[]`)) {
        paths.add(p);
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const full = prefix ? `${prefix}.${key}` : key;
      paths.add(full);
      for (const p of collectPaths(value, full)) {
        paths.add(p);
      }
    }
  }
  return paths;
}

interface FixtureScan {
  required: string[];
  optional: string[];
  fixtureCount: number;
}

function scanFixtures(fixturesDir: string): FixtureScan | null {
  if (!fs.existsSync(fixturesDir)) return null;

  const allPathSets: Set<string>[] = [];

  for (const mappingSlug of fs.readdirSync(fixturesDir)) {
    const mappingDir = path.join(fixturesDir, mappingSlug);
    if (!fs.statSync(mappingDir).isDirectory()) continue;

    for (const fixtureName of fs.readdirSync(mappingDir)) {
      const fixtureDir = path.join(mappingDir, fixtureName);
      if (!fs.statSync(fixtureDir).isDirectory()) continue;

      const metaPath = path.join(fixtureDir, 'meta.json');
      const expectedPath = path.join(fixtureDir, 'expected-output.json');
      if (!fs.existsSync(metaPath) || !fs.existsSync(expectedPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (meta.source !== 'stedi' || !meta.lastTestPassed) continue;

        const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));
        allPathSets.push(collectPaths(expected));
      } catch {
        continue;
      }
    }
  }

  if (allPathSets.length === 0) return null;

  let universal = new Set(allPathSets[0]);
  const allFields = new Set(allPathSets[0]);
  for (let i = 1; i < allPathSets.length; i++) {
    universal = new Set([...universal].filter((p) => allPathSets[i].has(p)));
    for (const p of allPathSets[i]) allFields.add(p);
  }

  const optional = [...allFields].filter((p) => !universal.has(p));

  return {
    required: [...universal].sort(),
    optional: optional.sort(),
    fixtureCount: allPathSets.length,
  };
}

// Resolve the fixtures directory — works from both repo root and apps/api CWD
function findFixturesDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'packages/jedi/src/mapping-tests/fixtures'),
    path.resolve(process.cwd(), 'apps/api/packages/jedi/src/mapping-tests/fixtures'),
    path.resolve(__dirname, '../mapping-tests/fixtures'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

let _cachedSchema: TmsOutputSchema | null = null;

export function deriveSchemaFromFixtures(): TmsOutputSchema | null {
  const result = scanFixtures(findFixturesDir());
  if (!result) return null;
  return {
    required: result.required,
    optional: result.optional,
    noExtraFields: false,
  };
}

export const defaultTmsSchema: TmsOutputSchema = (() => {
  const derived = deriveSchemaFromFixtures();
  if (derived) {
    _cachedSchema = derived;
    return derived;
  }
  // Fallback when no fixtures exist (e.g. fresh install, CI)
  return {
    required: [],
    optional: [],
    noExtraFields: false,
  };
})();

export function refreshTmsSchema(): TmsOutputSchema {
  const derived = deriveSchemaFromFixtures();
  if (derived) {
    _cachedSchema = derived;
    Object.assign(defaultTmsSchema, derived);
  }
  return defaultTmsSchema;
}
