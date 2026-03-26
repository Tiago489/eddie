export interface Segment {
  id: string;
  elements: string[];
}

export function tokenizeSegments(
  raw: string,
  segmentTerminator: string,
  elementSeparator: string,
): Segment[] {
  if (raw.length === 0) {
    return [];
  }

  return raw
    .split(segmentTerminator)
    .map((s) => s.replace(/[\r\n]+/g, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const elements = s.split(elementSeparator);
      return {
        id: elements[0],
        elements,
      };
    });
}
