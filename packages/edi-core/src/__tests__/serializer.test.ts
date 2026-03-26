import { describe, it, expect } from 'vitest';
import { X12Serializer } from '../serializer/x12-serializer';

describe('X12Serializer', () => {
  it('should throw not implemented error', () => {
    const serializer = new X12Serializer();
    expect(() => serializer.serialize({})).toThrow('Not implemented');
  });
});
