import jsonata, { type Expression } from 'jsonata';
import type { MappingResult } from '@edi-platform/types';

// Stedi-compat: $lookupTable(table, keyColumn, keyValue) → row or undefined
function lookupTable(
  table: Array<Record<string, unknown>> | undefined,
  keyColumn: string,
  keyValue: unknown,
): Record<string, unknown> | undefined {
  if (!Array.isArray(table)) return undefined;
  return table.find((row) => row[keyColumn] === keyValue);
}

// Sentinel values Stedi mappings use for conditional omission
const OMIT_FIELD = Symbol.for('stedi_omit_field');
const OMIT_ARRAY_ITEM = Symbol.for('stedi_omit_array_item');

export class JsonataEvaluator {
  private customFunctions: Array<{
    name: string;
    fn: (...args: unknown[]) => unknown;
    signature?: string;
  }> = [];

  private bindings: Record<string, unknown> = {};

  registerFunction(name: string, fn: (...args: unknown[]) => unknown, signature?: string): void {
    this.customFunctions.push({ name, fn, signature });
  }

  registerBinding(name: string, value: unknown): void {
    this.bindings[name] = value;
  }

  async evaluate<T>(expression: string, input: unknown, timeoutMs = 5000): Promise<MappingResult<T>> {
    try {
      const expr: Expression = jsonata(expression);

      // Register Stedi-compat functions
      expr.registerFunction('lookupTable', lookupTable);
      expr.registerFunction('trim', (s: unknown) => typeof s === 'string' ? s.trim() : s);
      expr.registerFunction('omitField', () => OMIT_FIELD);

      for (const { name, fn, signature } of this.customFunctions) {
        expr.registerFunction(name, fn, signature);
      }

      // Build bindings with Stedi-compat defaults
      const evalBindings: Record<string, unknown> = {
        tables: {},         // Empty lookup tables — mappings degrade gracefully
        omitField: OMIT_FIELD,
        omitArrayItem: OMIT_ARRAY_ITEM,
        ...this.bindings,
      };

      const evaluationPromise = Promise.resolve(expr.evaluate(input, evalBindings)) as Promise<T>;

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
