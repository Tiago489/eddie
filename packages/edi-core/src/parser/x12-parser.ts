import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';
import { parseIsa } from './envelope';
import { tokenizeSegments, type Segment } from './segments';

export interface ParsedEnvelope {
  isaControlNumber: string;
  gsControlNumber: string | null;
  transactionSetId: string;
  segments: string[][];
  transactionSegments: Segment[];
}

export class X12Parser {
  parse(rawEdi: string): ParseResult<ParsedEnvelope> {
    const isa = parseIsa(rawEdi);
    if (!isa) {
      return {
        success: false,
        error: 'Invalid or missing ISA segment',
        code: ParseErrorCode.INVALID_ISA_ENVELOPE,
      };
    }

    const { elementSeparator, segmentTerminator } = isa;

    const segmentStrings = rawEdi
      .split(segmentTerminator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const segments = segmentStrings.map((s) => s.split(elementSeparator));

    const tokenized = tokenizeSegments(rawEdi, segmentTerminator, elementSeparator);

    const stIndex = tokenized.findIndex((s) => s.id === 'ST');
    if (stIndex === -1) {
      return {
        success: false,
        error: 'Missing ST segment',
        code: ParseErrorCode.MISSING_TRANSACTION_SET,
      };
    }

    const seIndex = tokenized.findIndex((s) => s.id === 'SE');
    if (seIndex === -1) {
      return {
        success: false,
        error: 'Missing SE segment for transaction set',
        code: ParseErrorCode.INVALID_TRANSACTION_SET,
      };
    }

    const transactionSegments = tokenized.slice(stIndex + 1, seIndex);

    const stSegment = tokenized[stIndex];

    const gsSegment = segments.find((s) => s[0] === 'GS');
    const warnings: string[] = [];

    if (!gsSegment) {
      warnings.push('GS_MISSING');
    }

    return {
      success: true,
      data: {
        isaControlNumber: isa.controlNumber,
        gsControlNumber: gsSegment ? gsSegment[6] : null,
        transactionSetId: stSegment.elements[1],
        segments,
        transactionSegments,
      },
      warnings,
    };
  }
}
