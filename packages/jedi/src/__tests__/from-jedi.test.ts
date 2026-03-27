import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { X12Parser } from '@edi-platform/edi-core';
import type { MappingResult } from '@edi-platform/types';
import { fromJedi990, fromJedi214, fromJedi210 } from '../transforms/from-jedi';
import type { JediDocument } from '../types/jedi';

const fixturesDir = resolve(__dirname, '../../../../tests/fixtures');
const parser = new X12Parser();

function loadJedi204(): JediDocument {
  return JSON.parse(readFileSync(resolve(fixturesDir, 'jedi/expected_204_jedi.json'), 'utf-8'));
}

describe('fromJedi990', () => {
  it('should generate valid 990 EDI from a JEDI 204 document', () => {
    const jediDoc = loadJedi204();
    const result: MappingResult<string> = fromJedi990(jediDoc);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const parseResult = parser.parse(result.output);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    expect(parseResult.data.transactionSetId).toBe('990');
    expect(parseResult.data.isaControlNumber).toBeTruthy();
    expect(result.output).toContain('B1');
  });

  it('should set decline code when acceptCode is D', () => {
    const jediDoc = loadJedi204();
    const result = fromJedi990(jediDoc, { acceptCode: 'D' });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // B1 segment should contain 'D' as the accept/decline code
    const lines = result.output.split('~');
    const b1Line = lines.find((l) => l.includes('B1'));
    expect(b1Line).toBeDefined();
    expect(b1Line).toContain('*D');
  });

  it('should fail when shipment ID is missing', () => {
    const jediDoc = loadJedi204();
    // Remove shipment ID from B2
    const ts = jediDoc.interchanges[0].functional_groups[0].transaction_sets[0] as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    delete ts.heading.beginning_segment_for_shipper_order_B2.B2_04_ShipmentIdentificationNumber;

    const result = fromJedi990(jediDoc);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toLowerCase()).toContain('shipment');
    }
  });
});

describe('fromJedi214', () => {
  it('should generate valid 214 EDI from a JEDI 204 document', () => {
    const jediDoc = loadJedi204();
    const result = fromJedi214(jediDoc, { statusCode: 'AF', statusReason: 'AA' });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const parseResult = parser.parse(result.output);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    expect(parseResult.data.transactionSetId).toBe('214');
    expect(result.output).toContain('AT7');
  });

  it('should propagate status code into AT7 segment', () => {
    const jediDoc = loadJedi204();
    const result = fromJedi214(jediDoc, { statusCode: 'X3', statusReason: 'NS' });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const lines = result.output.split('~');
    const at7Line = lines.find((l) => l.includes('AT7'));
    expect(at7Line).toBeDefined();
    expect(at7Line).toContain('X3');
  });
});

describe('fromJedi210', () => {
  it('should generate valid 210 EDI from a JEDI 204 document', () => {
    const jediDoc = loadJedi204();
    const result = fromJedi210(jediDoc, { invoiceNumber: 'INV-001', totalCharges: 1500.0 });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const parseResult = parser.parse(result.output);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    expect(parseResult.data.transactionSetId).toBe('210');
    expect(result.output).toContain('B3');
    expect(result.output).toContain('L3');
  });

  it('should handle zero charges', () => {
    const jediDoc = loadJedi204();
    const result = fromJedi210(jediDoc, { invoiceNumber: 'INV-002', totalCharges: 0 });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const lines = result.output.split('~');
    const l3Line = lines.find((l) => l.trimStart().startsWith('L3'));
    expect(l3Line).toBeDefined();
    expect(l3Line).toContain('0');
  });
});

describe('from-jedi with minimal JEDI input', () => {
  function minimalJedi(): JediDocument {
    return {
      interchanges: [
        {
          ISA_01_AuthorizationInformationQualifier: '00',
          ISA_02_AuthorizationInformation: '',
          ISA_06_InterchangeSenderId: 'A',
          ISA_08_InterchangeReceiverId: 'B',
          ISA_13_InterchangeControlNumber: '1',
          functional_groups: [
            {
              GS_02_ApplicationSenderCode: 'A',
              GS_03_ApplicationReceiverCode: 'B',
              GS_06_GroupControlNumber: '1',
              transaction_sets: [
                {
                  heading: {
                    transaction_set_header_ST: {
                      ST_01_TransactionSetIdentifierCode: '204',
                      ST_02_TransactionSetControlNumber: '0001',
                    },
                    beginning_segment_for_shipper_order_B2: {
                      B2_04_ShipmentIdentificationNumber: 'SHIP1',
                    },
                  },
                  detail: { stop_off_details_loop_S5: [] },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('should generate 990 from minimal JEDI (no L11, no SCAC)', () => {
    const result = fromJedi990(minimalJedi());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.output).toContain('ST*990');
    expect(result.output).toContain('B1**SHIP1*A');
  });

  it('should generate 214 from minimal JEDI (no stops, no L11)', () => {
    const result = fromJedi214(minimalJedi(), { statusCode: 'AF', statusReason: 'AA' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.output).toContain('ST*214');
    expect(result.output).toContain('AT7*AF*AA');
    // No MS1 segment since no stops
    expect(result.output).not.toContain('MS1');
  });

  it('should generate 214 with stop that has N1 but no N4', () => {
    const jedi = minimalJedi();
    const ts = jedi.interchanges[0].functional_groups[0].transaction_sets[0] as Record<string, unknown>;
    (ts as { detail: { stop_off_details_loop_S5: unknown[] } }).detail.stop_off_details_loop_S5 = [
      {
        stop_off_details_S5: { S5_01_StopSequenceNumber: '1', S5_02_StopReasonCode: 'CL' },
        party_identification_loop_N1: [{ name_N1: { N1_01_EntityIdentifierCode: 'SF' } }],
      },
    ];

    const result = fromJedi214(jedi, { statusCode: 'AF', statusReason: 'AA' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // No MS1 since N4 is missing on the stop's N1
    expect(result.output).not.toContain('MS1');
  });

  it('should generate 210 with N1 that has minimal fields', () => {
    const jedi = minimalJedi();
    const ts = jedi.interchanges[0].functional_groups[0].transaction_sets[0] as Record<string, unknown>;
    (ts as { heading: { party_identification_loop_N1?: unknown[] } }).heading.party_identification_loop_N1 = [
      { name_N1: { N1_01_EntityIdentifierCode: 'SH' } },
    ];
    (ts as { heading: { beginning_segment_for_shipper_order_B2: { B2_02_StandardCarrierAlphaCode?: string } } })
      .heading.beginning_segment_for_shipper_order_B2.B2_02_StandardCarrierAlphaCode = 'XSCAC';

    const result = fromJedi210(jedi, { invoiceNumber: 'X', totalCharges: 10 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.output).toContain('N1*SH*');
    expect(result.output).toContain('N1*CA*XSCAC');
  });

  it('should generate 210 from minimal JEDI (no N1 loops, no SCAC)', () => {
    const result = fromJedi210(minimalJedi(), { invoiceNumber: 'X', totalCharges: 0 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.output).toContain('ST*210');
    expect(result.output).toContain('L3');
    // No carrier N1 since no SCAC
    const lines = result.output.split('~');
    const caN1 = lines.find((l) => l.includes('N1*CA'));
    expect(caN1).toBeUndefined();
  });
});
