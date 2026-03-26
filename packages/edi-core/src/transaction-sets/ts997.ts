import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';

export interface Ts997Data {
  transactionSetId: '997';
  functionalGroupAck: unknown[];
}

export function parseTs997(_segments: string[][]): ParseResult<Ts997Data> {
  return { success: false, error: 'Not implemented', code: ParseErrorCode.UNKNOWN };
}
