import { describe, it, expect } from 'vitest';
import { JsonataEvaluator } from '../evaluator/jsonata-evaluator';

describe('JsonataEvaluator', () => {
  const evaluator = new JsonataEvaluator();

  it('should evaluate a simple JSONata expression against JSON input', async () => {
    const input = { name: 'Eddie', version: 1 };
    const result = await evaluator.evaluate<string>('name', input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('Eddie');
    }
  });

  it('should timeout and throw a typed error on a long-running expression', async () => {
    const slowEvaluator = new JsonataEvaluator();
    slowEvaluator.registerFunction('delay', () =>
      new Promise((resolve) => setTimeout(resolve, 5000, 42)),
    );

    const result = await slowEvaluator.evaluate<number>('$delay()', {}, 50);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('timed out');
    }
  });

  it('should return a typed MappingResult discriminated union', async () => {
    const result = await evaluator.evaluate<number>('1 + 1', {});

    expect(result).toHaveProperty('success');
    if (result.success) {
      expect(result).toHaveProperty('output');
    } else {
      expect(result).toHaveProperty('error');
    }
  });
});
