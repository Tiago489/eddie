import jsonata, { type Expression } from 'jsonata';
import type { MappingResult } from '@edi-platform/types';
import { getDefaultTables, type LookupTableSet } from './stedi-lookup-tables';

function lookupTable(
  table: Array<Record<string, unknown>> | undefined,
  keyColumn: string,
  keyValue: unknown,
): Record<string, unknown> | undefined {
  if (!Array.isArray(table)) return undefined;
  return table.find((row) => row[keyColumn] === keyValue);
}

const OMIT_FIELD = Symbol.for('stedi_omit_field');
const OMIT_ARRAY_ITEM = Symbol.for('stedi_omit_array_item');

// Reusable: maps AT5 handling code to service type.
// Any mapping can call $serviceType(AT5[0].special_handling_code_01)
function serviceType(code: unknown): string {
  if (typeof code !== 'string') return 'PICKUP_AND_DELIVERY';
  switch (code) {
    case 'PUC': return 'PICKUP';
    case 'DEL': case 'LCL': return 'DELIVERY';
    default: return 'PICKUP_AND_DELIVERY';
  }
}

// Reusable: returns true if the service type includes a delivery leg
function hasDelivery(code: unknown): boolean {
  const st = serviceType(code);
  return st === 'DELIVERY' || st === 'PICKUP_AND_DELIVERY';
}

// Reusable: returns true if the service type includes a pickup leg
function hasPickup(code: unknown): boolean {
  const st = serviceType(code);
  return st === 'PICKUP' || st === 'PICKUP_AND_DELIVERY';
}

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

  async evaluate<T>(
    expression: string,
    input: unknown,
    timeoutMs = 5000,
    tables?: LookupTableSet,
  ): Promise<MappingResult<T>> {
    try {
      const expr: Expression = jsonata(expression);

      expr.registerFunction('lookupTable', lookupTable);
      expr.registerFunction('trim', (s: unknown) => typeof s === 'string' ? s.trim() : s);
      expr.registerFunction('omitField', () => OMIT_FIELD);
      expr.registerFunction('serviceType', serviceType);
      expr.registerFunction('hasDelivery', hasDelivery);
      expr.registerFunction('hasPickup', hasPickup);

      for (const { name, fn, signature } of this.customFunctions) {
        expr.registerFunction(name, fn, signature);
      }

      const evalBindings: Record<string, unknown> = {
        tables: tables ?? getDefaultTables(),
        omitField: OMIT_FIELD,
        omitArrayItem: OMIT_ARRAY_ITEM,
        ...this.bindings,
      };

      const evaluationPromise = Promise.resolve(expr.evaluate(input, evalBindings)) as Promise<T>;

      let timerId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error(`Mapping timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });

      const result = await Promise.race([evaluationPromise, timeoutPromise]);
      clearTimeout(timerId!);

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
