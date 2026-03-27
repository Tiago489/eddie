import type { MappingResult } from '@edi-platform/types';
import type { JediDocument, Jedi204 } from '../types/jedi';

const SEP = '*';
const TERM = '~';

function seg(...elements: string[]): string {
  return elements.join(SEP) + TERM;
}

function pad(value: string, length: number): string {
  return value.padEnd(length, ' ').substring(0, length);
}

function nowDate(): { yymmdd: string; ccyymmdd: string; hhmm: string } {
  const d = new Date();
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  return {
    yymmdd: yyyy.slice(2) + mm + dd,
    ccyymmdd: yyyy + mm + dd,
    hhmm: hh + mi,
  };
}

function buildIsaGsIeaGe(
  jediDoc: JediDocument,
  gsCode: string,
  controlNum: string,
  innerSegments: string[],
): string {
  const interchange = jediDoc.interchanges[0];
  const group = interchange.functional_groups[0];
  const { yymmdd, hhmm } = nowDate();

  // Outbound: swap sender/receiver
  const senderId = pad(interchange.ISA_08_InterchangeReceiverId, 15);
  const receiverId = pad(interchange.ISA_06_InterchangeSenderId, 15);

  const isa = seg(
    'ISA',
    '00',
    pad('', 10),
    '00',
    pad('', 10),
    'ZZ',
    senderId,
    'ZZ',
    receiverId,
    yymmdd,
    hhmm,
    'U',
    '00401',
    controlNum.padStart(9, '0'),
    '0',
    'P',
    '>',
  );

  const gs = seg(
    'GS',
    gsCode,
    interchange.ISA_08_InterchangeReceiverId,
    interchange.ISA_06_InterchangeSenderId,
    yymmdd.length === 6 ? '20' + yymmdd : yymmdd,
    hhmm,
    controlNum,
    'X',
    '004010',
  );

  const ge = seg('GE', '1', controlNum);
  const iea = seg('IEA', '1', controlNum.padStart(9, '0'));

  return isa + '\n' + gs + '\n' + innerSegments.join('\n') + '\n' + ge + '\n' + iea;
}

function extractTs204(jediDoc: JediDocument): Jedi204 | null {
  const ts = jediDoc.interchanges[0]?.functional_groups[0]?.transaction_sets[0];
  if (!ts || !('detail' in ts)) return null;
  return ts as Jedi204;
}

export function fromJedi990(
  jediDoc: JediDocument,
  options?: { acceptCode?: 'A' | 'D' },
): MappingResult<string> {
  const ts204 = extractTs204(jediDoc);
  const shipmentId = ts204?.heading?.beginning_segment_for_shipper_order_B2?.B2_04_ShipmentIdentificationNumber;

  if (!shipmentId) {
    return { success: false, error: 'Missing shipment ID in source document' };
  }

  const acceptCode = options?.acceptCode ?? 'A';
  const controlNum = String(Date.now() % 1000000);

  const innerSegs: string[] = [];
  innerSegs.push(seg('ST', '990', '0001'));
  innerSegs.push(seg('B1', '', shipmentId, acceptCode));

  const l11s = ts204?.heading?.reference_identification_L11;
  if (l11s && l11s.length > 0) {
    innerSegs.push(seg('L11', l11s[0].L11_01_ReferenceIdentification, 'BM'));
  }

  const segCount = innerSegs.length + 1; // +1 for SE itself
  innerSegs.push(seg('SE', String(segCount), '0001'));

  const output = buildIsaGsIeaGe(jediDoc, 'SM', controlNum, innerSegs);

  return { success: true, output };
}

export function fromJedi214(
  jediDoc: JediDocument,
  options: { statusCode: string; statusReason: string },
): MappingResult<string> {
  const ts204 = extractTs204(jediDoc);
  const shipmentId = ts204?.heading?.beginning_segment_for_shipper_order_B2?.B2_04_ShipmentIdentificationNumber ?? '';
  const scac = ts204?.heading?.beginning_segment_for_shipper_order_B2?.B2_02_StandardCarrierAlphaCode ?? '';
  const controlNum = String(Date.now() % 1000000);
  const { ccyymmdd, hhmm } = nowDate();

  const innerSegs: string[] = [];
  innerSegs.push(seg('ST', '214', '0001'));
  innerSegs.push(seg('B10', shipmentId, '', scac));

  const l11s = ts204?.heading?.reference_identification_L11;
  if (l11s && l11s.length > 0) {
    innerSegs.push(seg('L11', l11s[0].L11_01_ReferenceIdentification, 'BM'));
  }

  innerSegs.push(seg('AT7', options.statusCode, options.statusReason, '', '', ccyymmdd, hhmm));

  // Get location from last stop
  const stops = ts204?.detail?.stop_off_details_loop_S5;
  if (stops && stops.length > 0) {
    const lastStop = stops[stops.length - 1];
    const n1Loop = lastStop.party_identification_loop_N1?.[0];
    const n4 = n1Loop?.geographic_location_N4;
    if (n4) {
      innerSegs.push(seg('MS1', n4.N4_01_CityName ?? '', n4.N4_02_StateOrProvinceCode ?? ''));
    }
  }

  const segCount = innerSegs.length + 1;
  innerSegs.push(seg('SE', String(segCount), '0001'));

  const output = buildIsaGsIeaGe(jediDoc, 'QM', controlNum, innerSegs);

  return { success: true, output };
}

export function fromJedi210(
  jediDoc: JediDocument,
  options: { invoiceNumber: string; totalCharges: number },
): MappingResult<string> {
  const ts204 = extractTs204(jediDoc);
  const shipmentId = ts204?.heading?.beginning_segment_for_shipper_order_B2?.B2_04_ShipmentIdentificationNumber ?? '';
  const scac = ts204?.heading?.beginning_segment_for_shipper_order_B2?.B2_02_StandardCarrierAlphaCode ?? '';
  const controlNum = String(Date.now() % 1000000);
  const { ccyymmdd } = nowDate();

  const innerSegs: string[] = [];
  innerSegs.push(seg('ST', '210', '0001'));
  innerSegs.push(seg('B3', '', options.invoiceNumber, shipmentId, '', 'CC', ccyymmdd));

  // N1 loops from heading
  const n1Loops = ts204?.heading?.party_identification_loop_N1;
  if (n1Loops) {
    for (const loop of n1Loops) {
      const n1 = loop.name_N1;
      innerSegs.push(
        seg(
          'N1',
          n1.N1_01_EntityIdentifierCode,
          n1.N1_02_Name ?? '',
          n1.N1_03_IdentificationCodeQualifier ?? '',
          n1.N1_04_IdentificationCode ?? '',
        ),
      );
    }
  }

  // Add carrier N1
  if (scac) {
    innerSegs.push(seg('N1', 'CA', scac));
  }

  // Weight from first stop or default
  let weight = '0';
  const stops = ts204?.detail?.stop_off_details_loop_S5;
  if (stops && stops.length > 0) {
    // Weight is not in JEDI type directly, default to 0
    weight = '0';
  }

  innerSegs.push(seg('L0', '1', '', '', weight, 'L'));
  innerSegs.push(seg('L3', weight, 'L', options.totalCharges.toFixed(2)));

  const segCount = innerSegs.length + 1;
  innerSegs.push(seg('SE', String(segCount), '0001'));

  const output = buildIsaGsIeaGe(jediDoc, 'IM', controlNum, innerSegs);

  return { success: true, output };
}
