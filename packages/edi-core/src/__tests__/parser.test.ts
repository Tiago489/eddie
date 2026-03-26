import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ParseErrorCode } from '@edi-platform/types';
import { X12Parser } from '../parser/x12-parser';
import { tokenizeSegments } from '../parser/segments';
import { groupLoops, extractSegment, extractAllSegments } from '../parser/loops';

describe('X12Parser', () => {
  const parser = new X12Parser();
  const fixturePath = resolve(__dirname, '../../../../tests/fixtures/edi/sample_204.edi');

  it('should parse a 204 fixture and extract ISA control number', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const result = parser.parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isaControlNumber).toBe('000000001');
      expect(result.warnings).toEqual([]);
    }
  });

  it('should identify the transaction set as 204', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const result = parser.parse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transactionSetId).toBe('204');
      expect(result.warnings).toEqual([]);
    }
  });

  it('should return a ParseResult success shape', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    const result = parser.parse(raw);

    expect(result).toHaveProperty('success');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(result.data).toHaveProperty('isaControlNumber');
      expect(result.data).toHaveProperty('transactionSetId');
      expect(result.data).toHaveProperty('segments');
    }
  });

  // ── Group 1: Delimiter edge cases (envelope layer) ──

  describe('delimiter edge cases', () => {
    it('should parse a file using pipe | as element separator', () => {
      const raw =
        'ISA|00|          |00|          |ZZ|SENDER         |ZZ|RECEIVER       |230101|1200|U|00401|000000001|0|P|>~' +
        'GS|SM|SENDER|RECEIVER|20230101|1200|1|X|004010~' +
        'ST|204|0001~' +
        'SE|2|0001~' +
        'GE|1|1~' +
        'IEA|1|000000001~';

      const result = parser.parse(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isaControlNumber).toBe('000000001');
        expect(result.data.transactionSetId).toBe('204');
      }
    });

    it('should parse a file using newline as segment terminator', () => {
      const raw =
        'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>\n' +
        'GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010\n' +
        'ST*204*0001\n' +
        'SE*2*0001\n' +
        'GE*1*1\n' +
        'IEA*1*000000001\n';

      const result = parser.parse(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isaControlNumber).toBe('000000001');
        expect(result.data.transactionSetId).toBe('204');
      }
    });

    it('should return INVALID_ISA_ENVELOPE when ISA is fewer than 106 characters', () => {
      const raw = 'ISA*00*     *00*     *ZZ*SHORT~';

      const result = parser.parse(raw);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ParseErrorCode.INVALID_ISA_ENVELOPE);
      }
    });

    it('should return INVALID_ISA_ENVELOPE when file does not start with ISA', () => {
      const raw =
        'GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010~' +
        'ST*204*0001~' +
        'SE*2*0001~' +
        'GE*1*1~';

      const result = parser.parse(raw);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ParseErrorCode.INVALID_ISA_ENVELOPE);
      }
    });

    it('should return INVALID_ISA_ENVELOPE when ISA is 106 chars but has bad element count', () => {
      // 106 chars starting with 'ISA' where position 3 is '#',
      // but '#' never appears again — split produces only 1 element
      const raw = 'ISA#' + 'X'.repeat(102);

      expect(raw.length).toBe(106);
      const result = parser.parse(raw);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ParseErrorCode.INVALID_ISA_ENVELOPE);
      }
    });
  });

  // ── Group 1b: Missing SE segment ──

  describe('missing SE segment', () => {
    it('should return INVALID_TRANSACTION_SET when ST is present but SE is missing', () => {
      const raw =
        'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>~' +
        'GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010~' +
        'ST*204*0001~' +
        'B2**SCAC**SH12345***PP~' +
        'GE*1*1~' +
        'IEA*1*000000001~';

      const result = parser.parse(raw);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ParseErrorCode.INVALID_TRANSACTION_SET);
      }
    });
  });

  // ── Group 2: Segment tokenizer (segments.ts) ──

  describe('segment tokenizer', () => {
    it('should tokenize raw EDI into segment objects with id and elements', () => {
      const raw = 'ST*204*0001~B2**SCAC**SH12345~SE*2*0001~';
      const segments = tokenizeSegments(raw, '~', '*');

      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ id: 'ST', elements: ['ST', '204', '0001'] });
      expect(segments[1]).toEqual({ id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345'] });
      expect(segments[2]).toEqual({ id: 'SE', elements: ['SE', '2', '0001'] });
    });

    it('should correctly split elements using the detected elementSeparator', () => {
      const raw = 'ST|204|0001~SE|2|0001~';
      const segments = tokenizeSegments(raw, '~', '|');

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ id: 'ST', elements: ['ST', '204', '0001'] });
      expect(segments[1]).toEqual({ id: 'SE', elements: ['SE', '2', '0001'] });
    });

    it('should strip the segment terminator from the final element', () => {
      const raw = 'ST*204*0001~';
      const segments = tokenizeSegments(raw, '~', '*');

      expect(segments).toHaveLength(1);
      // The last element should be '0001', not '0001~'
      expect(segments[0].elements[2]).toBe('0001');
    });

    it('should return an empty array for an empty string input', () => {
      const segments = tokenizeSegments('', '~', '*');

      expect(segments).toEqual([]);
    });
  });

  // ── Group 3: Transaction set extraction (x12-parser.ts) ──

  describe('transaction set extraction', () => {
    it('should return MISSING_TRANSACTION_SET when no ST segment is found', () => {
      const raw =
        'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>~' +
        'GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010~' +
        'GE*1*1~' +
        'IEA*1*000000001~';

      const result = parser.parse(raw);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(ParseErrorCode.MISSING_TRANSACTION_SET);
      }
    });

    it('should extract all segments between ST and SE into transactionSegments', () => {
      const raw = readFileSync(fixturePath, 'utf-8');
      const result = parser.parse(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('transactionSegments');
        const txSegments = (result.data as Record<string, unknown>).transactionSegments as Array<{
          id: string;
          elements: string[];
        }>;
        // ST and SE themselves should not be in transactionSegments
        expect(txSegments.find((s) => s.id === 'ST')).toBeUndefined();
        expect(txSegments.find((s) => s.id === 'SE')).toBeUndefined();
        // B2 is the first segment after ST in the 204 fixture
        expect(txSegments[0].id).toBe('B2');
        // Should contain all segments between ST and SE
        expect(txSegments.length).toBeGreaterThan(0);
      }
    });

    it('should return warnings with GS_MISSING when GS segment is absent', () => {
      const raw =
        'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>~' +
        'ST*204*0001~' +
        'B2**SCAC**SH12345***PP~' +
        'SE*3*0001~' +
        'IEA*1*000000001~';

      const result = parser.parse(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toContain('GS_MISSING');
      }
    });
  });

  // ── Group 4: Loops utility ──

  describe('loops utility', () => {
    it('should split segments into groups on S5 boundaries', () => {
      const segments = [
        { id: 'ST', elements: ['ST', '204', '0001'] },
        { id: 'B2', elements: ['B2', '', 'SCAC'] },
        { id: 'S5', elements: ['S5', '1', 'CL'] },
        { id: 'N1', elements: ['N1', 'SF', 'Origin'] },
        { id: 'N3', elements: ['N3', '100 Main St'] },
        { id: 'S5', elements: ['S5', '2', 'CU'] },
        { id: 'N1', elements: ['N1', 'ST', 'Dest'] },
        { id: 'SE', elements: ['SE', '8', '0001'] },
      ];

      const groups = groupLoops(segments, ['S5']);

      expect(groups).toHaveLength(2);
      expect(groups[0].loopId).toBe('S5');
      expect(groups[0].segments).toEqual([
        { id: 'S5', elements: ['S5', '1', 'CL'] },
        { id: 'N1', elements: ['N1', 'SF', 'Origin'] },
        { id: 'N3', elements: ['N3', '100 Main St'] },
      ]);
      expect(groups[1].loopId).toBe('S5');
      expect(groups[1].segments).toEqual([
        { id: 'S5', elements: ['S5', '2', 'CU'] },
        { id: 'N1', elements: ['N1', 'ST', 'Dest'] },
        { id: 'SE', elements: ['SE', '8', '0001'] },
      ]);
    });

    it('should return empty array when no segment matches loopStartIds', () => {
      const segments = [
        { id: 'ST', elements: ['ST', '204', '0001'] },
        { id: 'B2', elements: ['B2', '', 'SCAC'] },
      ];

      const groups = groupLoops(segments, ['S5']);

      expect(groups).toEqual([]);
    });

    it('should extract the first matching segment', () => {
      const segments = [
        { id: 'N1', elements: ['N1', 'SH', 'First'] },
        { id: 'N1', elements: ['N1', 'SF', 'Second'] },
      ];

      const result = extractSegment(segments, 'N1');

      expect(result).toBeDefined();
      expect(result!.elements[2]).toBe('First');
    });

    it('should return undefined when segment not found', () => {
      const segments = [{ id: 'B2', elements: ['B2', '', 'SCAC'] }];

      expect(extractSegment(segments, 'N1')).toBeUndefined();
    });

    it('should extract all matching segments', () => {
      const segments = [
        { id: 'L11', elements: ['L11', 'REF1', 'SI'] },
        { id: 'B2', elements: ['B2', '', 'SCAC'] },
        { id: 'L11', elements: ['L11', 'REF2', 'PO'] },
      ];

      const results = extractAllSegments(segments, 'L11');

      expect(results).toHaveLength(2);
      expect(results[0].elements[1]).toBe('REF1');
      expect(results[1].elements[1]).toBe('REF2');
    });
  });
});
