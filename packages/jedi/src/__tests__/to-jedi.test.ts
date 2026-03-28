import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { X12Parser } from '@edi-platform/edi-core';
import type { Segment, ParsedEnvelope } from '@edi-platform/edi-core';
import type { MappingResult } from '@edi-platform/types';
import { toJedi204, toJedi211, toJedi997, toJedi } from '../transforms/to-jedi';
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

describe('toJedi211', () => {
  const parser = new X12Parser();

  it('should parse a real 211 BOL EDI file into a JediDocument', () => {
    const rawEdi = readFileSync(resolve(fixturesDir, 'edi/sample_211.edi'), 'utf-8');
    const parseResult = parser.parse(rawEdi);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const result = toJedi211(parseResult.data);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: {
        transaction_set_header_ST: { ST_01_TransactionSetIdentifierCode: string };
        bill_of_lading_BOL: {
          BOL_01_StandardCarrierAlphaCode: string;
          BOL_02_ShipmentMethodOfPayment: string;
          BOL_03_ShipmentIdentificationNumber: string;
          BOL_04_Date?: string;
          BOL_05_Time?: string;
          BOL_06_ReferenceIdentification?: string;
        };
        set_purpose_B2A?: { B2A_01_TransactionSetPurposeCode: string };
        reference_identification_L11?: Array<{ L11_01_ReferenceIdentification: string; L11_02_ReferenceIdentificationQualifier: string }>;
        date_time_reference_G62?: Array<Record<string, string>>;
        party_identification_loop_N1?: Array<{
          name_N1: { N1_01_EntityIdentifierCode: string; N1_02_Name?: string };
          contact_G61?: { G61_04_CommunicationNumber?: string };
        }>;
      };
      detail: { line_items: Array<Record<string, unknown>> };
      summary?: { transaction_set_trailer_SE: { SE_01_NumberOfIncludedSegments: string } };
    };

    // Header
    expect(ts.heading.transaction_set_header_ST.ST_01_TransactionSetIdentifierCode).toBe('211');
    expect(ts.heading.bill_of_lading_BOL.BOL_01_StandardCarrierAlphaCode).toBe('NWKD');
    expect(ts.heading.bill_of_lading_BOL.BOL_02_ShipmentMethodOfPayment).toBe('CC');
    expect(ts.heading.bill_of_lading_BOL.BOL_03_ShipmentIdentificationNumber).toBe('BNA-472-95777450-00');
    expect(ts.heading.bill_of_lading_BOL.BOL_04_Date).toBe('20260324');
    expect(ts.heading.bill_of_lading_BOL.BOL_06_ReferenceIdentification).toBe('SMF');

    // B2A
    expect(ts.heading.set_purpose_B2A?.B2A_01_TransactionSetPurposeCode).toBe('04');

    // L11 references
    expect(ts.heading.reference_identification_L11?.length).toBeGreaterThanOrEqual(7);
    const crRef = ts.heading.reference_identification_L11?.find((l) => l.L11_02_ReferenceIdentificationQualifier === 'CR');
    expect(crRef?.L11_01_ReferenceIdentification).toBe('12345');

    // N1 loops with G61 contacts
    expect(ts.heading.party_identification_loop_N1?.length).toBe(2);
    const shipper = ts.heading.party_identification_loop_N1?.find((n) => n.name_N1.N1_01_EntityIdentifierCode === 'SH');
    expect(shipper?.name_N1.N1_02_Name).toBe('SHIPPER CORP');
    expect(shipper?.contact_G61?.G61_04_CommunicationNumber).toBe('6155551234');

    const consignee = ts.heading.party_identification_loop_N1?.find((n) => n.name_N1.N1_01_EntityIdentifierCode === 'CN');
    expect(consignee?.name_N1.N1_02_Name).toBe('CONSIGNEE LLC');

    // Line items
    expect(ts.detail.line_items.length).toBe(1);

    // Summary
    expect(ts.summary?.transaction_set_trailer_SE.SE_01_NumberOfIncludedSegments).toBe('22');
  });

  it('should fail when BOL segment is missing', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '211',
      segments: [],
      transactionSegments: [
        { id: 'B2A', elements: ['B2A', '04'] },
        { id: 'N1', elements: ['N1', 'SH', 'Shipper'] },
      ],
    };

    const result = toJedi211(parsed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('BOL');
    }
  });

  it('should handle minimal 211 with only BOL segment', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '211',
      segments: [],
      transactionSegments: [
        { id: 'BOL', elements: ['BOL', 'SCAC', 'PP', 'PRO123'] },
      ],
    };

    const result = toJedi211(parsed);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { bill_of_lading_BOL: { BOL_03_ShipmentIdentificationNumber: string } };
      detail: { line_items: unknown[] };
    };
    expect(ts.heading.bill_of_lading_BOL.BOL_03_ShipmentIdentificationNumber).toBe('PRO123');
    expect(ts.detail.line_items).toHaveLength(0);
  });
});

describe('toJedi (router)', () => {
  const parser = new X12Parser();

  it('should route 204 to toJedi204', () => {
    const edi = readFileSync(resolve(fixturesDir, 'edi/sample_204.edi'), 'utf-8');
    const parsed = parser.parse(edi);
    if (!parsed.success) throw new Error('Parse failed');

    const result = toJedi(parsed.data);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { beginning_segment_for_shipper_order_B2: Record<string, unknown> };
    };
    expect(ts.heading.beginning_segment_for_shipper_order_B2).toBeDefined();
  });

  it('should route 211 to toJedi211', () => {
    const edi = readFileSync(resolve(fixturesDir, 'edi/sample_211.edi'), 'utf-8');
    const parsed = parser.parse(edi);
    if (!parsed.success) throw new Error('Parse failed');

    const result = toJedi(parsed.data);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ts = result.output.interchanges[0].functional_groups[0].transaction_sets[0] as {
      heading: { bill_of_lading_BOL: Record<string, unknown> };
    };
    expect(ts.heading.bill_of_lading_BOL).toBeDefined();
  });

  it('should route 997 to toJedi997', () => {
    const edi = readFileSync(resolve(fixturesDir, 'edi/sample_997.edi'), 'utf-8');
    const parsed = parser.parse(edi);
    if (!parsed.success) throw new Error('Parse failed');

    const result = toJedi(parsed.data);
    expect(result.success).toBe(true);
  });
});
