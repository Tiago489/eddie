import type { MappingResult } from '@edi-platform/types';
import type {
  JediDocument,
  JediInterchangeEnvelope,
  JediFunctionalGroup,
  Jedi204,
  Jedi211,
  Stedi211TransactionSet,
  StediN1Loop,
  N1_Loop,
} from '../types/jedi';
import type { ParsedEnvelope, Segment } from '@edi-platform/edi-core';
import { extractSegment, extractAllSegments, groupLoops } from '@edi-platform/edi-core';

function buildN1Loops(segments: Segment[]): N1_Loop[] {
  const loops: N1_Loop[] = [];
  let i = 0;

  while (i < segments.length) {
    if (segments[i].id !== 'N1') {
      i++;
      continue;
    }

    const n1 = segments[i];
    const loop: N1_Loop = {
      name_N1: {
        N1_01_EntityIdentifierCode: n1.elements[1],
        ...(n1.elements[2] ? { N1_02_Name: n1.elements[2] } : {}),
        ...(n1.elements[3] ? { N1_03_IdentificationCodeQualifier: n1.elements[3] } : {}),
        ...(n1.elements[4] ? { N1_04_IdentificationCode: n1.elements[4] } : {}),
      },
    };
    i++;

    if (i < segments.length && segments[i].id === 'N3') {
      const n3 = segments[i];
      loop.address_information_N3 = {
        N3_01_AddressInformation: n3.elements[1],
        ...(n3.elements[2] ? { N3_02_AddressInformation: n3.elements[2] } : {}),
      };
      i++;
    }

    if (i < segments.length && segments[i].id === 'N4') {
      const n4 = segments[i];
      loop.geographic_location_N4 = {
        ...(n4.elements[1] ? { N4_01_CityName: n4.elements[1] } : {}),
        ...(n4.elements[2] ? { N4_02_StateOrProvinceCode: n4.elements[2] } : {}),
        ...(n4.elements[3] ? { N4_03_PostalCode: n4.elements[3] } : {}),
      };
      i++;
    }

    loops.push(loop);
  }

  return loops;
}

function buildIsaEnvelope(parsed: ParsedEnvelope): JediInterchangeEnvelope {
  const isaSeg = parsed.segments.find((s) => s[0] === 'ISA');

  if (isaSeg) {
    return {
      ISA_01_AuthorizationInformationQualifier: isaSeg[1],
      ISA_02_AuthorizationInformation: isaSeg[2],
      ISA_06_InterchangeSenderId: isaSeg[6].trim(),
      ISA_08_InterchangeReceiverId: isaSeg[8].trim(),
      ISA_13_InterchangeControlNumber: isaSeg[13],
      ISA_14_AcknowledgmentRequested: isaSeg[14],
      ISA_15_InterchangeUsageIndicator: isaSeg[15],
      functional_groups: [],
    };
  }

  return {
    ISA_01_AuthorizationInformationQualifier: '',
    ISA_02_AuthorizationInformation: '',
    ISA_06_InterchangeSenderId: '',
    ISA_08_InterchangeReceiverId: '',
    ISA_13_InterchangeControlNumber: parsed.isaControlNumber,
    functional_groups: [],
  };
}

function buildGsGroup(parsed: ParsedEnvelope): JediFunctionalGroup {
  const gsSeg = parsed.segments.find((s) => s[0] === 'GS');

  if (gsSeg) {
    return {
      GS_02_ApplicationSenderCode: gsSeg[2],
      GS_03_ApplicationReceiverCode: gsSeg[3],
      GS_04_Date: gsSeg[4],
      GS_05_Time: gsSeg[5],
      GS_06_GroupControlNumber: gsSeg[6],
      transaction_sets: [],
    };
  }

  return {
    GS_02_ApplicationSenderCode: '',
    GS_03_ApplicationReceiverCode: '',
    GS_06_GroupControlNumber: parsed.gsControlNumber ?? '',
    transaction_sets: [],
  };
}

export function toJedi204(parsed: ParsedEnvelope): MappingResult<JediDocument> {
  const txSegs = parsed.transactionSegments;

  const b2 = extractSegment(txSegs, 'B2');
  if (!b2) {
    return {
      success: false,
      error: 'Missing required B2 segment',
    };
  }

  const stSeg = extractSegment(parsed.segments.map((s) => ({ id: s[0], elements: s })), 'ST');
  const seSeg = extractSegment(parsed.segments.map((s) => ({ id: s[0], elements: s })), 'SE');

  const l11s = extractAllSegments(txSegs, 'L11');
  const headingG62s: Segment[] = [];
  const headingN1Segs: Segment[] = [];

  // Collect heading segments before first S5
  const firstS5Idx = txSegs.findIndex((s) => s.id === 'S5');
  const headingSegs = firstS5Idx === -1 ? txSegs : txSegs.slice(0, firstS5Idx);

  for (const seg of headingSegs) {
    if (seg.id === 'G62') headingG62s.push(seg);
    if (seg.id === 'N1' || seg.id === 'N3' || seg.id === 'N4') headingN1Segs.push(seg);
  }

  const headingL11s = extractAllSegments(headingSegs, 'L11');

  const heading: Jedi204['heading'] = {
    transaction_set_header_ST: {
      ST_01_TransactionSetIdentifierCode: parsed.transactionSetId,
      ST_02_TransactionSetControlNumber: stSeg?.elements[2] ?? '0001',
    },
    beginning_segment_for_shipper_order_B2: {
      ...(b2.elements[2] ? { B2_02_StandardCarrierAlphaCode: b2.elements[2] } : {}),
      ...(b2.elements[4] ? { B2_04_ShipmentIdentificationNumber: b2.elements[4] } : {}),
      ...(b2.elements[7] ? { B2_06_ShipmentMethodOfPayment: b2.elements[7] } : {}),
    },
  };

  if (headingL11s.length > 0) {
    heading.reference_identification_L11 = headingL11s.map((s) => ({
      L11_01_ReferenceIdentification: s.elements[1],
      L11_02_ReferenceIdentificationQualifier: s.elements[2],
    }));
  }

  if (headingG62s.length > 0) {
    heading.date_time_reference_G62 = headingG62s.map((s) => ({
      ...(s.elements[1] ? { G62_01_DateQualifier: s.elements[1] } : {}),
      ...(s.elements[2] ? { G62_02_Date: s.elements[2] } : {}),
    }));
  }

  const headingN1Loops = buildN1Loops(headingN1Segs);
  if (headingN1Loops.length > 0) {
    heading.party_identification_loop_N1 = headingN1Loops;
  }

  // Build S5 stop-off detail loops
  const s5Groups = groupLoops(txSegs, ['S5']);
  const stopOffs = s5Groups.map((group) => {
    const s5Seg = group.segments[0];
    const groupSegs = group.segments.slice(1); // segments after S5

    const stopOff: Jedi204['detail']['stop_off_details_loop_S5'][number] = {
      stop_off_details_S5: {
        S5_01_StopSequenceNumber: s5Seg.elements[1],
        S5_02_StopReasonCode: s5Seg.elements[2],
      },
    };

    const stopN1Segs = groupSegs.filter((s) => s.id === 'N1' || s.id === 'N3' || s.id === 'N4');
    const stopN1Loops = buildN1Loops(stopN1Segs);
    if (stopN1Loops.length > 0) {
      stopOff.party_identification_loop_N1 = stopN1Loops;
    }

    const stopL11s = extractAllSegments(groupSegs, 'L11');
    if (stopL11s.length > 0) {
      stopOff.reference_identification_L11 = stopL11s.map((s) => ({
        L11_01_ReferenceIdentification: s.elements[1],
        L11_02_ReferenceIdentificationQualifier: s.elements[2],
      }));
    }

    const stopG62s = extractAllSegments(groupSegs, 'G62');
    if (stopG62s.length > 0) {
      stopOff.date_time_reference_G62 = stopG62s.map((s) => ({
        ...(s.elements[1] ? { G62_01_DateQualifier: s.elements[1] } : {}),
        ...(s.elements[2] ? { G62_02_Date: s.elements[2] } : {}),
      }));
    }

    return stopOff;
  });

  const ts204: Jedi204 = {
    heading,
    detail: {
      stop_off_details_loop_S5: stopOffs,
    },
  };

  if (seSeg) {
    ts204.summary = {
      transaction_set_trailer_SE: {
        SE_01_NumberOfIncludedSegments: seSeg.elements[1],
        SE_02_TransactionSetControlNumber: seSeg.elements[2],
      },
    };
  }

  const envelope = buildIsaEnvelope(parsed);
  const group = buildGsGroup(parsed);
  group.transaction_sets.push(ts204);
  envelope.functional_groups.push(group);

  return {
    success: true,
    output: { interchanges: [envelope] },
  };
}

// ---------------------------------------------------------------------------
// Stedi-compatible N1 loop builder for 211
// ---------------------------------------------------------------------------

const N1_ENTITY_TO_ROLE: Record<string, string> = {
  SH: 'shipper',
  SF: 'shipper',
  CN: 'consignee',
  ST: 'consignee',
  BT: 'bill_to',
  BY: 'buying_party',
  SE: 'selling_party',
  CA: 'carrier',
  PF: 'party_to_receive_freight_bill',
};

function buildStediN1Loops(segments: Segment[]): Record<string, StediN1Loop> {
  const result: Record<string, StediN1Loop> = {};
  let i = 0;

  while (i < segments.length) {
    if (segments[i].id !== 'N1') { i++; continue; }

    const n1 = segments[i];
    const entityCode = n1.elements[1];
    const role = N1_ENTITY_TO_ROLE[entityCode] ?? entityCode.toLowerCase();
    const key = `name_N1_loop_${role}`;

    const loop: StediN1Loop = {
      name_N1: {
        entity_identifier_code_01: entityCode,
        ...(n1.elements[2] ? { name_02: n1.elements[2] } : {}),
        ...(n1.elements[3] ? { identification_code_qualifier_03: n1.elements[3] } : {}),
        ...(n1.elements[4] ? { identification_code_04: n1.elements[4] } : {}),
      },
    };
    i++;

    if (i < segments.length && segments[i].id === 'N3') {
      const n3 = segments[i];
      loop.address_information_N3 = [{
        address_information_01: n3.elements[1],
        ...(n3.elements[2] ? { address_information_02: n3.elements[2] } : {}),
      }];
      i++;
    }

    if (i < segments.length && segments[i].id === 'N4') {
      const n4 = segments[i];
      loop.geographic_location_N4 = {
        ...(n4.elements[1] ? { city_name_01: n4.elements[1] } : {}),
        ...(n4.elements[2] ? { state_or_province_code_02: n4.elements[2] } : {}),
        ...(n4.elements[3] ? { postal_code_03: n4.elements[3] } : {}),
        ...(n4.elements[4] ? { country_code_04: n4.elements[4] } : {}),
      };
      i++;
    }

    // Collect all G61 segments
    const contacts: StediN1Loop['contact_G61'] = [];
    while (i < segments.length && segments[i].id === 'G61') {
      const g61 = segments[i];
      contacts.push({
        ...(g61.elements[1] ? { contact_function_code_01: g61.elements[1] } : {}),
        ...(g61.elements[2] ? { name_02: g61.elements[2] } : {}),
        ...(g61.elements[3] ? { communication_number_qualifier_03: g61.elements[3] } : {}),
        ...(g61.elements[4] ? { communication_number_04: g61.elements[4] } : {}),
      });
      i++;
    }
    if (contacts.length > 0) loop.contact_G61 = contacts;

    result[key] = loop;
  }

  return result;
}

// ---------------------------------------------------------------------------
// toJedi211 — outputs Stedi-compatible flat format
// ---------------------------------------------------------------------------

export function toJedi211(parsed: ParsedEnvelope): MappingResult<JediDocument> {
  const txSegs = parsed.transactionSegments;

  const bol = extractSegment(txSegs, 'BOL');
  if (!bol) {
    return { success: false, error: 'Missing required BOL segment' };
  }

  const stSeg = extractSegment(parsed.segments.map((s) => ({ id: s[0], elements: s })), 'ST');
  const seSeg = extractSegment(parsed.segments.map((s) => ({ id: s[0], elements: s })), 'SE');
  const isaSeg = parsed.segments.find((s) => s[0] === 'ISA');

  const b2a = extractSegment(txSegs, 'B2A');

  // Split heading vs detail at first AT1/LX
  const firstDetailIdx = txSegs.findIndex((s) => s.id === 'AT1' || s.id === 'LX');
  const headingSegs = firstDetailIdx === -1 ? txSegs : txSegs.slice(0, firstDetailIdx);

  const headingL11s = extractAllSegments(headingSegs, 'L11');
  const headingG62s = extractAllSegments(headingSegs, 'G62');
  const headingAT5s = extractAllSegments(headingSegs, 'AT5');
  const headingK1s = extractAllSegments(headingSegs, 'K1');
  const headingN1Segs = headingSegs.filter(
    (s) => s.id === 'N1' || s.id === 'N3' || s.id === 'N4' || s.id === 'G61',
  );

  // Build heading
  const heading: Stedi211TransactionSet['heading'] = {
    transaction_set_header_ST: {
      transaction_set_identifier_code_01: parsed.transactionSetId,
      transaction_set_control_number_02: stSeg?.elements[2] ?? '0001',
    },
    beginning_segment_for_the_motor_carrier_bill_of_lading_BOL: {
      standard_carrier_alpha_code_01: bol.elements[1],
      shipment_method_of_payment_02: bol.elements[2],
      shipment_identification_number_03: bol.elements[3],
      ...(bol.elements[4] ? { date_04: bol.elements[4] } : {}),
      ...(bol.elements[5] ? { time_05: bol.elements[5] } : {}),
      ...(bol.elements[6] ? { reference_identification_06: bol.elements[6] } : {}),
    },
  };

  if (b2a) {
    heading.set_purpose_B2A = {
      transaction_set_purpose_code_01: b2a.elements[1],
    };
  }

  if (headingL11s.length > 0) {
    heading.business_instructions_and_reference_number_L11 = headingL11s.map((s) => ({
      reference_identification_01: s.elements[1],
      reference_identification_qualifier_02: s.elements[2],
    }));
  }

  if (headingG62s.length > 0) {
    heading.date_time_G62 = headingG62s.map((s) => ({
      ...(s.elements[1] ? { date_qualifier_01: s.elements[1] } : {}),
      ...(s.elements[2] ? { date_02: s.elements[2] } : {}),
    }));
  }

  if (headingAT5s.length > 0) {
    heading.bill_of_lading_handling_requirements_AT5 = headingAT5s.map((s) => ({
      ...(s.elements[1] ? { special_handling_code_01: s.elements[1] } : {}),
      ...(s.elements[2] ? { special_handling_description_02: s.elements[2] } : {}),
    }));
  }

  if (headingK1s.length > 0) {
    heading.remarks_K1 = headingK1s.map((s) => ({
      ...(s.elements[1] ? { free_form_message_01: s.elements[1] } : {}),
      ...(s.elements[2] ? { free_form_message_02: s.elements[2] } : {}),
    }));
  }

  // N1 loops keyed by role
  const n1LoopMap = buildStediN1Loops(headingN1Segs);
  for (const [key, loop] of Object.entries(n1LoopMap)) {
    (heading as Record<string, unknown>)[key] = loop;
  }

  // Build detail — AT1 loop structure
  const detailSegs = firstDetailIdx === -1 ? [] : txSegs.slice(firstDetailIdx);
  type AT1Loop = NonNullable<Stedi211TransactionSet['detail']['bill_of_lading_line_item_number_AT1_loop']>[number];
  const at1Loops: AT1Loop[] = [];
  let currentLoop: AT1Loop | null = null;

  for (const seg of detailSegs) {
    if (seg.id === 'AT1' || seg.id === 'LX') {
      if (currentLoop) at1Loops.push(currentLoop);
      currentLoop = {};
    } else if (seg.id === 'AT2' && currentLoop) {
      if (!currentLoop.bill_of_lading_line_item_detail_AT2_loop) {
        currentLoop.bill_of_lading_line_item_detail_AT2_loop = [];
      }
      // AT2 elements per Stedi guide: 01=quantity, 02=packaging, 03=weight_qualifier, 04=weight_unit, 05=weight
      // Numeric fields stored as numbers (Stedi guide coerces these, JSONata division requires numbers)
      const qty = seg.elements[1] ? Number(seg.elements[1]) : undefined;
      const wt = seg.elements[5] ? Number(seg.elements[5]) : undefined;
      currentLoop.bill_of_lading_line_item_detail_AT2_loop.push({
        bill_of_lading_line_item_detail_AT2: {
          ...(qty !== undefined && !isNaN(qty) ? { lading_quantity_01: qty } : {}),
          ...(seg.elements[2] ? { packaging_form_code_02: seg.elements[2] } : {}),
          ...(seg.elements[3] ? { weight_qualifier_03: seg.elements[3] } : {}),
          ...(seg.elements[4] ? { weight_unit_code_04: seg.elements[4] } : {}),
          ...(wt !== undefined && !isNaN(wt) ? { weight_05: wt } : {}),
        },
      });
    } else if (seg.id === 'AT3' && currentLoop) {
      if (!currentLoop.bill_of_lading_charges_AT3) {
        currentLoop.bill_of_lading_charges_AT3 = [];
      }
      currentLoop.bill_of_lading_charges_AT3.push({
        ...(seg.elements[1] ? { allowance_or_charge_rate_01: seg.elements[1] } : {}),
        ...(seg.elements[2] ? { freight_rate_02: seg.elements[2] } : {}),
      });
    } else if (seg.id === 'AT4' && currentLoop) {
      if (!currentLoop.bill_of_lading_description_AT4) {
        currentLoop.bill_of_lading_description_AT4 = [];
      }
      currentLoop.bill_of_lading_description_AT4.push({
        ...(seg.elements[1] ? { lading_description_01: seg.elements[1] } : {}),
      });
    } else if (seg.id === 'L11' && currentLoop) {
      if (!currentLoop.business_instructions_and_reference_number_L11) {
        currentLoop.business_instructions_and_reference_number_L11 = [];
      }
      currentLoop.business_instructions_and_reference_number_L11.push({
        reference_identification_01: seg.elements[1],
        reference_identification_qualifier_02: seg.elements[2],
      });
    }
  }
  if (currentLoop) at1Loops.push(currentLoop);

  const ts211: Stedi211TransactionSet = {
    heading,
    detail: {
      ...(at1Loops.length > 0 ? { bill_of_lading_line_item_number_AT1_loop: at1Loops } : {}),
    },
  };

  if (seSeg) {
    ts211.summary = {
      transaction_set_trailer_SE: {
        number_of_included_segments_01: seSeg.elements[1],
        transaction_set_control_number_02: seSeg.elements[2],
      },
    };
  }

  const doc: Jedi211 = {
    envelope: {
      interchangeHeader: {
        senderId: isaSeg ? isaSeg[6].trim() : '',
        receiverId: isaSeg ? isaSeg[8].trim() : '',
        controlNumber: parsed.isaControlNumber,
        ...(isaSeg?.[1] ? { authorizationInformationQualifier: isaSeg[1] } : {}),
        ...(isaSeg?.[2] ? { authorizationInformation: isaSeg[2] } : {}),
        ...(isaSeg?.[14] ? { acknowledgmentRequestedCode: isaSeg[14] } : {}),
        ...(isaSeg?.[15] ? { usageIndicatorCode: isaSeg[15] } : {}),
      },
    },
    transactionSets: [ts211],
  };

  return { success: true, output: doc };
}

export function toJedi(parsed: ParsedEnvelope): MappingResult<JediDocument> {
  switch (parsed.transactionSetId) {
    case '204': return toJedi204(parsed);
    case '211': return toJedi211(parsed);
    case '997': return toJedi997(parsed);
    default: return toJedi204(parsed); // fallback for unknown sets
  }
}

export function toJedi997(parsed: ParsedEnvelope): MappingResult<JediDocument> {
  const txSegs = parsed.transactionSegments;

  const stSeg = extractSegment(parsed.segments.map((s) => ({ id: s[0], elements: s })), 'ST');
  const seSeg = extractSegment(parsed.segments.map((s) => ({ id: s[0], elements: s })), 'SE');

  const ak1 = extractSegment(txSegs, 'AK1');
  const ak9 = extractSegment(txSegs, 'AK9');

  const ak2Groups = groupLoops(txSegs, ['AK2']);
  const ak2Loops = ak2Groups.map((group) => {
    const ak2Seg = group.segments[0];
    const ak5Seg = extractSegment(group.segments, 'AK5');

    const loop: {
      transaction_set_response_header_AK2: {
        AK2_01_TransactionSetIdentifierCode: string;
        AK2_02_TransactionSetControlNumber: string;
      };
      transaction_set_response_trailer_AK5: {
        AK5_01_TransactionSetAcknowledgmentCode: string;
        AK5_02_ImplementationTransactionSetSyntaxErrorCode?: string;
      };
    } = {
      transaction_set_response_header_AK2: {
        AK2_01_TransactionSetIdentifierCode: ak2Seg.elements[1],
        AK2_02_TransactionSetControlNumber: ak2Seg.elements[2],
      },
      transaction_set_response_trailer_AK5: {
        AK5_01_TransactionSetAcknowledgmentCode: ak5Seg?.elements[1] ?? '',
        ...(ak5Seg?.elements[2]
          ? { AK5_02_ImplementationTransactionSetSyntaxErrorCode: ak5Seg.elements[2] }
          : {}),
      },
    };

    return loop;
  });

  const heading: {
    transaction_set_header_ST: { ST_01_TransactionSetIdentifierCode: string; ST_02_TransactionSetControlNumber: string };
    functional_group_response_header_AK1: { AK1_01_FunctionalIdentifierCode: string; AK1_02_GroupControlNumber: string };
    transaction_set_response_loop_AK2?: typeof ak2Loops;
    functional_group_response_trailer_AK9: {
      AK9_01_FunctionalGroupAcknowledgeCode: string;
      AK9_02_NumberOfTransactionSetsIncluded: string;
      AK9_03_NumberOfReceivedTransactionSets: string;
      AK9_04_NumberOfAcceptedTransactionSets: string;
    };
    transaction_set_trailer_SE: { SE_01_NumberOfIncludedSegments: string; SE_02_TransactionSetControlNumber: string };
  } = {
    transaction_set_header_ST: {
      ST_01_TransactionSetIdentifierCode: parsed.transactionSetId,
      ST_02_TransactionSetControlNumber: stSeg?.elements[2] ?? '0001',
    },
    functional_group_response_header_AK1: {
      AK1_01_FunctionalIdentifierCode: ak1?.elements[1] ?? '',
      AK1_02_GroupControlNumber: ak1?.elements[2] ?? '',
    },
    functional_group_response_trailer_AK9: {
      AK9_01_FunctionalGroupAcknowledgeCode: ak9?.elements[1] ?? '',
      AK9_02_NumberOfTransactionSetsIncluded: ak9?.elements[2] ?? '',
      AK9_03_NumberOfReceivedTransactionSets: ak9?.elements[3] ?? '',
      AK9_04_NumberOfAcceptedTransactionSets: ak9?.elements[4] ?? '',
    },
    transaction_set_trailer_SE: {
      SE_01_NumberOfIncludedSegments: seSeg?.elements[1] ?? '',
      SE_02_TransactionSetControlNumber: seSeg?.elements[2] ?? '',
    },
  };

  if (ak2Loops.length > 0) {
    heading.transaction_set_response_loop_AK2 = ak2Loops;
  }

  const ts997 = { heading };

  const envelope = buildIsaEnvelope(parsed);
  const group = buildGsGroup(parsed);
  group.transaction_sets.push(ts997);
  envelope.functional_groups.push(group);

  return {
    success: true,
    output: { interchanges: [envelope] },
  };
}
