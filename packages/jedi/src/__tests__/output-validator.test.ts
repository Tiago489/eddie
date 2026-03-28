import { describe, it, expect } from 'vitest';
import { validateTmsOutput, type TmsOutputSchema } from '../output-validator';
import { defaultTmsSchema } from '../tms-schema';

const VALID_OUTPUT = {
  referenceNumber: 'SH12345',
  carrier: { scac: 'ABCD', name: 'Acme Freight' },
  stops: [
    { sequence: 1, location: { city: 'Chicago', state: 'IL' } },
    { sequence: 2, location: { city: 'Dallas', state: 'TX' } },
  ],
};

describe('validateTmsOutput', () => {
  it('should return valid for a correct output', () => {
    const result = validateTmsOutput(VALID_OUTPUT, defaultTmsSchema);
    expect(result).toEqual({ valid: true });
  });

  it('should report missing required top-level field', () => {
    const { referenceNumber: _, ...missing } = VALID_OUTPUT;
    const result = validateTmsOutput(missing, defaultTmsSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Missing required field: referenceNumber');
    }
  });

  it('should report missing required nested field', () => {
    const output = { ...VALID_OUTPUT, carrier: { name: 'Acme' } };
    const result = validateTmsOutput(output, defaultTmsSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Missing required field: carrier.scac');
    }
  });

  it('should report multiple missing required fields', () => {
    const result = validateTmsOutput({}, defaultTmsSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBe(3);
      expect(result.errors).toContain('Missing required field: referenceNumber');
      expect(result.errors).toContain('Missing required field: carrier.scac');
      expect(result.errors).toContain('Missing required field: stops');
    }
  });

  it('should flag extra fields when noExtraFields is true', () => {
    const strict: TmsOutputSchema = {
      required: ['name'],
      optional: ['age'],
      noExtraFields: true,
    };
    const output = { name: 'Eddie', age: 1, secret: 'x' };
    const result = validateTmsOutput(output, strict);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('Unexpected field') && e.includes('secret'))).toBe(true);
    }
  });

  it('should allow extra fields when noExtraFields is false', () => {
    const permissive: TmsOutputSchema = {
      required: ['name'],
      optional: [],
      noExtraFields: false,
    };
    const output = { name: 'Eddie', extra: 'allowed' };
    const result = validateTmsOutput(output, permissive);
    expect(result).toEqual({ valid: true });
  });

  it('should return error for null output', () => {
    const result = validateTmsOutput(null, defaultTmsSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Output is null or undefined');
    }
  });

  it('should return error for undefined output', () => {
    const result = validateTmsOutput(undefined, defaultTmsSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Output is null or undefined');
    }
  });

  it('should return error for non-object output', () => {
    const result = validateTmsOutput('not an object', defaultTmsSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('Output must be a non-null object');
    }
  });

  it('should handle array index paths in required fields', () => {
    const schema: TmsOutputSchema = {
      required: ['items[0].name'],
      optional: [],
      noExtraFields: false,
    };
    const result = validateTmsOutput({ items: [{ name: 'foo' }] }, schema);
    expect(result).toEqual({ valid: true });

    const missing = validateTmsOutput({ items: [{}] }, schema);
    expect(missing.valid).toBe(false);
    if (!missing.valid) {
      expect(missing.errors).toContain('Missing required field: items[0].name');
    }
  });

  it('should not flag nested children of declared fields as extra', () => {
    const strict: TmsOutputSchema = {
      required: ['carrier'],
      optional: [],
      noExtraFields: true,
    };
    const output = { carrier: { scac: 'ABCD', name: 'Acme' } };
    const result = validateTmsOutput(output, strict);
    expect(result).toEqual({ valid: true });
  });
});
