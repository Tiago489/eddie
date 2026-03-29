import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { X12Parser } from '@edi-platform/edi-core';
import type { Segment, ParsedEnvelope } from '@edi-platform/edi-core';
import type { MappingResult } from '@edi-platform/types';
import { toJedi204, toJedi211, toJedi214, toJedi997, toJedi } from '../transforms/to-jedi';
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

  it('should parse a real 211 BOL EDI file into Stedi-compatible format', () => {
    const rawEdi = readFileSync(resolve(fixturesDir, 'edi/sample_211.edi'), 'utf-8');
    const parseResult = parser.parse(rawEdi);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const result = toJedi211(parseResult.data);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const doc = result.output as import('../types/jedi').Jedi211;

    // Envelope
    expect(doc.envelope.interchangeHeader.senderId).toBe('FWDA');
    expect(doc.envelope.interchangeHeader.receiverId).toBe('NWKD');

    const ts = doc.transactionSets[0];

    // Header — ST
    expect(ts.heading.transaction_set_header_ST.transaction_set_identifier_code_01).toBe('211');

    // BOL
    expect(ts.heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL.standard_carrier_alpha_code_01).toBe('NWKD');
    expect(ts.heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL.shipment_method_of_payment_02).toBe('CC');
    expect(ts.heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL.shipment_identification_number_03).toBe('BNA-472-95777450-00');
    expect(ts.heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL.date_04).toBe('20260324');
    expect(ts.heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL.reference_identification_06).toBe('SMF');

    // B2A
    expect(ts.heading.set_purpose_B2A?.transaction_set_purpose_code_01).toBe('04');

    // L11 references (Stedi name: business_instructions_and_reference_number_L11)
    const l11s = ts.heading.business_instructions_and_reference_number_L11;
    expect(l11s?.length).toBeGreaterThanOrEqual(7);
    const crRef = l11s?.find((l) => l.reference_identification_qualifier_02 === 'CR');
    expect(crRef?.reference_identification_01).toBe('12345');

    // N1 loops keyed by role
    const heading = ts.heading as Record<string, unknown>;
    const shipper = heading.name_N1_loop_shipper as import('../types/jedi').StediN1Loop;
    expect(shipper).toBeDefined();
    expect(shipper.name_N1.name_02).toBe('SHIPPER CORP');
    expect(shipper.contact_G61?.[0]?.communication_number_04).toBe('6155551234');

    const consignee = heading.name_N1_loop_consignee as import('../types/jedi').StediN1Loop;
    expect(consignee).toBeDefined();
    expect(consignee.name_N1.name_02).toBe('CONSIGNEE LLC');

    // Detail — AT1 loop
    expect(ts.detail.bill_of_lading_line_item_number_AT1_loop?.length).toBe(1);

    // Summary
    expect(ts.summary?.transaction_set_trailer_SE.number_of_included_segments_01).toBe('22');
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

    const doc = result.output as import('../types/jedi').Jedi211;
    const ts = doc.transactionSets[0];
    expect(ts.heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL.shipment_identification_number_03).toBe('PRO123');
    expect(ts.detail.bill_of_lading_line_item_number_AT1_loop).toBeUndefined();
  });
});

describe('toJedi214', () => {
  const parser = new X12Parser();

  it('should parse a 214 EDI file with B10 header into Stedi-compatible format', () => {
    const rawEdi = readFileSync(resolve(fixturesDir, 'edi/sample_214.edi'), 'utf-8');
    const parseResult = parser.parse(rawEdi);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const result = toJedi214(parseResult.data);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const doc = result.output as import('../types/jedi').Jedi214;
    expect(doc.envelope.interchangeHeader.senderId).toBe('CARRIER');
    expect(doc.envelope.interchangeHeader.receiverId).toBe('RECEIVER');

    const ts = doc.transactionSets[0];
    expect(ts.heading.transaction_set_header_ST.transaction_set_identifier_code_01).toBe('214');
    expect(ts.heading.beginning_segment_B10.reference_identification_01).toBe('SH12345');
    expect(ts.heading.beginning_segment_B10.standard_carrier_alpha_code_03).toBe('SCAC');

    expect(ts.heading.reference_identification_L11).toHaveLength(2);
    expect(ts.heading.reference_identification_L11![0].reference_identification_qualifier_02).toBe('BM');

    expect(ts.heading.shipment_status_details_AT7).toHaveLength(1);
    expect(ts.heading.shipment_status_details_AT7![0].shipment_status_code_01).toBe('X1');

    expect(ts.heading.equipment_location_MS1?.city_name_01).toBe('CHICAGO');
    expect(ts.heading.equipment_location_MS1?.state_or_province_code_02).toBe('IL');

    expect(ts.heading.shipment_weight_AT8?.weight_03).toBe(5000);
    expect(ts.heading.shipment_weight_AT8?.lading_quantity_04).toBe(200);

    expect(ts.summary?.transaction_set_trailer_SE.number_of_included_segments_01).toBe('8');
  });

  it('should fail when B10 segment is missing', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '214',
      segments: [],
      transactionSegments: [
        { id: 'L11', elements: ['L11', 'REF001', 'BM'] },
      ],
    };

    const result = toJedi214(parsed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('B10');
    }
  });

  it('should handle minimal 214 with only B10 segment', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '214',
      segments: [],
      transactionSegments: [
        { id: 'B10', elements: ['B10', 'REF123', 'SHIP456', 'ABCD'] },
      ],
    };

    const result = toJedi214(parsed);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const doc = result.output as import('../types/jedi').Jedi214;
    const ts = doc.transactionSets[0];
    expect(ts.heading.beginning_segment_B10.reference_identification_01).toBe('REF123');
    expect(ts.heading.beginning_segment_B10.standard_carrier_alpha_code_03).toBe('ABCD');
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

    const doc = result.output as import('../types/jedi').Jedi211;
    expect(doc.transactionSets[0].heading.beginning_segment_for_the_motor_carrier_bill_of_lading_BOL).toBeDefined();
    expect(doc.envelope.interchangeHeader.senderId).toBe('FWDA');
  });

  it('should route 214 to toJedi214', () => {
    const edi = readFileSync(resolve(fixturesDir, 'edi/sample_214.edi'), 'utf-8');
    const parsed = parser.parse(edi);
    if (!parsed.success) throw new Error('Parse failed');

    const result = toJedi(parsed.data);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const doc = result.output as import('../types/jedi').Jedi214;
    expect(doc.transactionSets[0].heading.beginning_segment_B10).toBeDefined();
  });

  it('should route 997 to toJedi997', () => {
    const edi = readFileSync(resolve(fixturesDir, 'edi/sample_997.edi'), 'utf-8');
    const parsed = parser.parse(edi);
    if (!parsed.success) throw new Error('Parse failed');

    const result = toJedi(parsed.data);
    expect(result.success).toBe(true);
  });

  it('should return error for unsupported transaction set', () => {
    const parsed: ParsedEnvelope = {
      isaControlNumber: '000000001',
      gsControlNumber: '1',
      transactionSetId: '999',
      segments: [],
      transactionSegments: [],
    };

    const result = toJedi(parsed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unsupported transaction set: 999');
    }
  });
});

describe('Stedi mapping compatibility', () => {
  const parser = new X12Parser();

  it('should evaluate the real Forward Air 211 INBOUND mapping without errors', async () => {
    const rawEdi = readFileSync(resolve(fixturesDir, 'edi/sample_211.edi'), 'utf-8');
    const mappingExpr = readFileSync(resolve(fixturesDir, 'jedi/fwd_air_211_mapping.jsonata'), 'utf-8');

    const parseResult = parser.parse(rawEdi);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const jediResult = toJedi211(parseResult.data);
    expect(jediResult.success).toBe(true);
    if (!jediResult.success) return;

    const { JsonataEvaluator } = await import('../evaluator/jsonata-evaluator');
    const evaluator = new JsonataEvaluator();
    const mapResult = await evaluator.evaluate<Record<string, unknown>>(mappingExpr, jediResult.output);

    // Should evaluate without "Attempted to invoke a non-function" or other errors
    if (!mapResult.success) {
      expect.fail(`Mapping failed: ${mapResult.error}`);
    }
    expect(mapResult.success).toBe(true);

    // Verify key fields were extracted from the JEDI output
    expect(mapResult.output.receiverId).toBe('NWKD');
    expect(mapResult.output.transactionSetIdentifierCode).toBe('211');
    expect(typeof mapResult.output.order).toBe('object');
    const order = mapResult.output.order as Record<string, unknown>;
    expect(order.secondaryRefNumber).toBe('BNA-472-95777450-00');
    expect(order.mawb).toBe('BNA-472-95777450-00');

    // Consignee and shipper should be populated from N1 loops
    expect(mapResult.output.consigneeInformation).toBeDefined();
    expect(mapResult.output.shipperInformation).toBeDefined();
    const consignee = mapResult.output.consigneeInformation as Record<string, unknown>;
    expect(consignee.name).toBe('CONSIGNEE LLC');
    expect(consignee.contactPhone).toBe('9165559876');
    const shipper = mapResult.output.shipperInformation as Record<string, unknown>;
    expect(shipper.name).toBe('SHIPPER CORP');
  });
});
