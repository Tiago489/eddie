import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { X12Parser } from '@edi-platform/edi-core';
import type { Segment, ParsedEnvelope } from '@edi-platform/edi-core';
import type { MappingResult } from '@edi-platform/types';
import { toJedi204, toJedi997 } from '../transforms/to-jedi';
import type { JediDocument } from '../types/jedi';

const fixturesDir = resolve(__dirname, '../../../../tests/fixtures');

describe('toJedi204', () => {
  const parser = new X12Parser();

  it('should produce a JediDocument matching the golden fixture', () => {
    const raw = readFileSync(resolve(fixturesDir, 'edi/sample_204.edi'), 'utf-8');
    const parseResult = parser.parse(raw);

    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const result: MappingResult<JediDocument> = toJedi204(parseResult.data);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const expected = JSON.parse(
      readFileSync(resolve(fixturesDir, 'jedi/expected_204_jedi.json'), 'utf-8'),
    );

    expect(result.output).toEqual(expected);
  });

  it('should return failure when B2 segment is missing', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'L11', elements: ['L11', 'REF123', 'SI'] },
        { id: 'SE', elements: ['SE', '2', '0001'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('B2');
    }
  });

  it('should return success with empty S5 loops when no S5 segment exists', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0];
    expect((ts as { detail: { stop_off_details_loop_S5: unknown[] } }).detail.stop_off_details_loop_S5).toEqual([]);
  });

  // ── Branch coverage: orphan N3 before first N1 (skip non-N1 in buildN1Loops) ──

  it('should skip orphan N3/N4 segments that appear before any N1', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
        { id: 'N3', elements: ['N3', 'Orphan Address'] },
        { id: 'N4', elements: ['N4', 'Orphan City', 'OC', '00000'] },
        { id: 'N1', elements: ['N1', 'SH', 'Real Shipper', '93', 'SHIP1'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { party_identification_loop_N1?: Array<{ name_N1: { N1_02_Name?: string } }> };
    };
    // Only the real N1 should be included, orphaned N3/N4 skipped
    expect(ts.heading.party_identification_loop_N1).toHaveLength(1);
    expect(ts.heading.party_identification_loop_N1![0].name_N1.N1_02_Name).toBe('Real Shipper');
  });

  // ── Branch coverage: N1 without N3 or N4 ──

  it('should handle N1 without N3 or N4', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
        { id: 'N1', elements: ['N1', 'SH', 'Shipper Only'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { party_identification_loop_N1: Array<{ address_information_N3?: unknown; geographic_location_N4?: unknown }> };
    };
    const n1 = ts.heading.party_identification_loop_N1[0];
    expect(n1.address_information_N3).toBeUndefined();
    expect(n1.geographic_location_N4).toBeUndefined();
  });

  // ── Branch coverage: N1 with N3 but no N4 ──

  it('should handle N1 with N3 but no N4', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
        { id: 'N1', elements: ['N1', 'SH', 'Shipper'] },
        { id: 'N3', elements: ['N3', '100 Main St'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { party_identification_loop_N1: Array<{ address_information_N3?: unknown; geographic_location_N4?: unknown }> };
    };
    const n1 = ts.heading.party_identification_loop_N1[0];
    expect(n1.address_information_N3).toBeDefined();
    expect(n1.geographic_location_N4).toBeUndefined();
  });

  // ── Branch coverage: S5 stop with L11 reference ──

  it('should include L11 references within S5 stop loops', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
        { id: 'S5', elements: ['S5', '1', 'CL'] },
        { id: 'L11', elements: ['L11', 'STOP_REF', 'SI'] },
        { id: 'N1', elements: ['N1', 'SF', 'Origin'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      detail: { stop_off_details_loop_S5: Array<{ reference_identification_L11?: Array<{ L11_01_ReferenceIdentification: string }> }> };
    };
    expect(ts.detail.stop_off_details_loop_S5[0].reference_identification_L11).toEqual([
      { L11_01_ReferenceIdentification: 'STOP_REF', L11_02_ReferenceIdentificationQualifier: 'SI' },
    ]);
  });

  // ── Branch coverage: N3 with second address line, N4 with empty fields, G62 with empty fields ──

  it('should handle N3 with second address line and N4/G62 with empty elements', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
        { id: 'G62', elements: ['G62', '', '', '', ''] },
        { id: 'N1', elements: ['N1', 'SH', 'Shipper'] },
        { id: 'N3', elements: ['N3', '100 Main St', 'Suite 200'] },
        { id: 'N4', elements: ['N4', '', '', ''] },
        { id: 'S5', elements: ['S5', '1', 'CL'] },
        { id: 'G62', elements: ['G62', '', '', '', ''] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: {
        date_time_reference_G62?: Array<Record<string, string>>;
        party_identification_loop_N1?: Array<{
          address_information_N3?: { N3_01_AddressInformation: string; N3_02_AddressInformation?: string };
          geographic_location_N4?: Record<string, string>;
        }>;
      };
      detail: {
        stop_off_details_loop_S5: Array<{ date_time_reference_G62?: Array<Record<string, string>> }>;
      };
    };

    // N3 second address line should be present
    expect(ts.heading.party_identification_loop_N1![0].address_information_N3!.N3_02_AddressInformation).toBe('Suite 200');
    // N4 with all empty elements: object should exist but be empty
    expect(ts.heading.party_identification_loop_N1![0].geographic_location_N4).toEqual({});
    // Heading G62 with empty elements: object should be empty
    expect(ts.heading.date_time_reference_G62![0]).toEqual({});
    // Stop G62 with empty elements
    expect(ts.detail.stop_off_details_loop_S5[0].date_time_reference_G62![0]).toEqual({});
  });

  // ── Branch coverage: B2 with minimal fields (empty optional elements) ──

  it('should handle B2 with empty optional elements', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', '', '', '', '', '', ''] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { beginning_segment_for_shipper_order_B2: Record<string, unknown> };
    };
    // All optional B2 fields should be absent when elements are empty strings
    expect(ts.heading.beginning_segment_for_shipper_order_B2).toEqual({});
  });

  // ── Branch coverage: N1 with minimal elements (no name, qualifier, code) ──

  it('should handle N1 with only entity identifier code', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '204',
      segments: [],
      transactionSegments: [
        { id: 'B2', elements: ['B2', '', 'SCAC', '', 'SH12345', '', '', 'PP'] },
        { id: 'N1', elements: ['N1', 'SH'] },
      ],
    };

    const result = toJedi204(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { party_identification_loop_N1: Array<{ name_N1: Record<string, unknown> }> };
    };
    const n1 = ts.heading.party_identification_loop_N1[0].name_N1;
    expect(n1.N1_01_EntityIdentifierCode).toBe('SH');
    expect(n1.N1_02_Name).toBeUndefined();
    expect(n1.N1_03_IdentificationCodeQualifier).toBeUndefined();
    expect(n1.N1_04_IdentificationCode).toBeUndefined();
  });
});

describe('toJedi997', () => {
  const parser = new X12Parser();

  it('should produce a JediDocument matching the golden fixture', () => {
    const raw = readFileSync(resolve(fixturesDir, 'edi/sample_997.edi'), 'utf-8');
    const parseResult = parser.parse(raw);

    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const result: MappingResult<JediDocument> = toJedi997(parseResult.data);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const expected = JSON.parse(
      readFileSync(resolve(fixturesDir, 'jedi/expected_997_jedi.json'), 'utf-8'),
    );

    expect(result.output).toEqual(expected);
  });

  it('should map AK5_01 acceptance code correctly', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000002',
      gsControlNumber: '2',
      transactionSetId: '997',
      segments: [],
      transactionSegments: [
        { id: 'AK1', elements: ['AK1', 'SM', '1'] },
        { id: 'AK2', elements: ['AK2', '204', '0001'] },
        { id: 'AK5', elements: ['AK5', 'A'] },
        { id: 'AK9', elements: ['AK9', 'A', '1', '1', '1'] },
      ],
    };

    const result = toJedi997(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts997 = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: {
        transaction_set_response_loop_AK2: Array<{
          transaction_set_response_trailer_AK5: { AK5_01_TransactionSetAcknowledgmentCode: string };
        }>;
      };
    };

    expect(
      ts997.heading.transaction_set_response_loop_AK2[0].transaction_set_response_trailer_AK5
        .AK5_01_TransactionSetAcknowledgmentCode,
    ).toBe('A');
  });

  // ── Branch coverage: AK5 with syntax error code (elements[2]) ──

  it('should include AK5_02 syntax error code when present', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000002',
      gsControlNumber: '2',
      transactionSetId: '997',
      segments: [],
      transactionSegments: [
        { id: 'AK1', elements: ['AK1', 'SM', '1'] },
        { id: 'AK2', elements: ['AK2', '204', '0001'] },
        { id: 'AK5', elements: ['AK5', 'R', '5'] },
        { id: 'AK9', elements: ['AK9', 'R', '1', '1', '0'] },
      ],
    };

    const result = toJedi997(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts997 = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: {
        transaction_set_response_loop_AK2: Array<{
          transaction_set_response_trailer_AK5: {
            AK5_01_TransactionSetAcknowledgmentCode: string;
            AK5_02_ImplementationTransactionSetSyntaxErrorCode?: string;
          };
        }>;
      };
    };

    const ak5 = ts997.heading.transaction_set_response_loop_AK2[0].transaction_set_response_trailer_AK5;
    expect(ak5.AK5_01_TransactionSetAcknowledgmentCode).toBe('R');
    expect(ak5.AK5_02_ImplementationTransactionSetSyntaxErrorCode).toBe('5');
  });

  // ── Branch coverage: 997 with no AK2 loops ──

  it('should handle 997 with no AK2 loops', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000002',
      gsControlNumber: '2',
      transactionSetId: '997',
      segments: [],
      transactionSegments: [
        { id: 'AK1', elements: ['AK1', 'SM', '1'] },
        { id: 'AK9', elements: ['AK9', 'A', '1', '1', '1'] },
      ],
    };

    const result = toJedi997(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts997 = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { transaction_set_response_loop_AK2?: unknown[] };
    };
    expect(ts997.heading.transaction_set_response_loop_AK2).toBeUndefined();
  });

  // ── Branch coverage: 997 with no AK1 or AK9 segments ──

  it('should use fallback empty strings when AK1 and AK9 are absent', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000002',
      gsControlNumber: null,
      transactionSetId: '997',
      segments: [],
      transactionSegments: [],
    };

    const result = toJedi997(parsed);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts997 = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: {
        functional_group_response_header_AK1: { AK1_01_FunctionalIdentifierCode: string };
        functional_group_response_trailer_AK9: { AK9_01_FunctionalGroupAcknowledgeCode: string };
        transaction_set_trailer_SE: { SE_01_NumberOfIncludedSegments: string };
      };
    };
    expect(ts997.heading.functional_group_response_header_AK1.AK1_01_FunctionalIdentifierCode).toBe('');
    expect(ts997.heading.functional_group_response_trailer_AK9.AK9_01_FunctionalGroupAcknowledgeCode).toBe('');
    expect(ts997.heading.transaction_set_trailer_SE.SE_01_NumberOfIncludedSegments).toBe('');

    // Also tests buildGsGroup fallback with gsControlNumber = null
    const group = result.output.interchanges[0].functional_groups[0];
    expect(group.GS_06_GroupControlNumber).toBe('');
  });
});
