export interface SerializerOptions {
  segmentTerminator?: string;
  elementSeparator?: string;
  subElementSeparator?: string;
}

export class X12Serializer {
  constructor(private options: SerializerOptions = {}) {}

  serialize(_data: Record<string, unknown>): string {
    throw new Error('Not implemented');
  }
}
