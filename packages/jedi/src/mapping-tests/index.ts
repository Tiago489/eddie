import { X12Parser } from '@edi-platform/edi-core';
import { JsonataEvaluator } from '../evaluator/jsonata-evaluator';
import { toJedi } from '../transforms/to-jedi';
import { validateTmsOutput } from '../output-validator';
import { defaultTmsSchema } from '../tms-schema';

export interface MappingFixture {
  name: string;
  carrier: string;
  inputEdi: string;
  expectedOutput: unknown;
  jsonataExpression: string;
}

export type MappingTestResult =
  | { pass: true; name: string; carrier: string; durationMs: number }
  | { pass: false; name: string; carrier: string; diff: string; errors: string[] };

const parser = new X12Parser();
const evaluator = new JsonataEvaluator();

function computeDiff(expected: unknown, actual: unknown): string {
  const expectedStr = JSON.stringify(expected, null, 2);
  const actualStr = JSON.stringify(actual, null, 2);

  if (expectedStr === actualStr) return '';

  const expectedLines = expectedStr.split('\n');
  const actualLines = actualStr.split('\n');
  const lines: string[] = [];

  const maxLen = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < maxLen; i++) {
    const exp = expectedLines[i] ?? '';
    const act = actualLines[i] ?? '';
    if (exp !== act) {
      if (exp) lines.push(`- ${exp}`);
      if (act) lines.push(`+ ${act}`);
    }
  }

  return lines.join('\n');
}

export async function runMappingTest(fixture: MappingFixture): Promise<MappingTestResult> {
  const { name, carrier } = fixture;
  const start = performance.now();
  const errors: string[] = [];

  // Step 1: Parse EDI → JEDI
  const parseResult = parser.parse(fixture.inputEdi);
  if (!parseResult.success) {
    return {
      pass: false,
      name,
      carrier,
      diff: '',
      errors: [`Parse failed: ${parseResult.error} [${parseResult.code}]`],
    };
  }

  const jediResult = toJedi(parseResult.data);
  if (!jediResult.success) {
    return {
      pass: false,
      name,
      carrier,
      diff: '',
      errors: [`JEDI transform failed: ${jediResult.error}`],
    };
  }

  // Step 2: Evaluate JSONata mapping
  const mapResult = await evaluator.evaluate<unknown>(
    fixture.jsonataExpression,
    jediResult.output,
  );
  if (!mapResult.success) {
    return {
      pass: false,
      name,
      carrier,
      diff: '',
      errors: [`Mapping evaluation failed: ${mapResult.error}`],
    };
  }

  // Step 3: Deep-compare output against expected
  const actualStr = JSON.stringify(mapResult.output, null, 2);
  const expectedStr = JSON.stringify(fixture.expectedOutput, null, 2);

  if (actualStr !== expectedStr) {
    errors.push('Output does not match expected');
  }

  // Step 4: Validate output against TMS schema
  const validation = validateTmsOutput(mapResult.output, defaultTmsSchema);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  const durationMs = Math.round(performance.now() - start);

  if (errors.length > 0) {
    return {
      pass: false,
      name,
      carrier,
      diff: computeDiff(fixture.expectedOutput, mapResult.output),
      errors,
    };
  }

  return { pass: true, name, carrier, durationMs };
}

export async function runAllMappingTests(fixtures: MappingFixture[]): Promise<MappingTestResult[]> {
  const results: MappingTestResult[] = [];
  for (const fixture of fixtures) {
    results.push(await runMappingTest(fixture));
  }
  return results;
}
