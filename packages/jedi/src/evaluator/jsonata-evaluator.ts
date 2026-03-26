import jsonata, { type Expression } from 'jsonata';
import type { MappingResult } from '@edi-platform/types';

export class JsonataEvaluator {
  private customFunctions: Array<{
    name: string;
    fn: (...args: unknown[]) => unknown;
    signature?: string;
  }> = [];

  registerFunction(name: string, fn: (...args: unknown[]) => unknown, signature?: string): void {
    this.customFunctions.push({ name, fn, signature });
  }

  async evaluate<T>(expression: string, input: unknown, timeoutMs = 5000): Promise<MappingResult<T>> {
    try {
      const expr: Expression = jsonata(expression);

      for (const { name, fn, signature } of this.customFunctions) {
        expr.registerFunction(name, fn, signature);
      }

      const evaluationPromise = Promise.resolve(expr.evaluate(input)) as Promise<T>;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Mapping timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      );

      const result = await Promise.race([evaluationPromise, timeoutPromise]);

      return {
        success: true,
        output: result,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        expression,
      };
    }
  }
}
