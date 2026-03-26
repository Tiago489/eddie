import type { Segment } from './segments';

export interface LoopGroup {
  loopId: string;
  segments: Segment[];
}

export function groupLoops(segments: Segment[], loopStartIds: string[]): LoopGroup[] {
  const startSet = new Set(loopStartIds);
  const groups: LoopGroup[] = [];
  let current: LoopGroup | null = null;

  for (const seg of segments) {
    if (startSet.has(seg.id)) {
      if (current) {
        groups.push(current);
      }
      current = { loopId: seg.id, segments: [seg] };
    } else if (current) {
      current.segments.push(seg);
    }
  }

  if (current) {
    groups.push(current);
  }

  return groups;
}

export function extractSegment(segments: Segment[], id: string): Segment | undefined {
  return segments.find((s) => s.id === id);
}

export function extractAllSegments(segments: Segment[], id: string): Segment[] {
  return segments.filter((s) => s.id === id);
}
