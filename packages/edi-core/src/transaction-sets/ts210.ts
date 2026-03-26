import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';

export interface Ts210Data {
  transactionSetId: '210';
  billOfLading?: string;
  stops: unknown[];
}

export function parseTs210(_segments: string[][]): ParseResult<Ts210Data> {
  return { success: false, error: 'Not implemented', code: ParseErrorCode.UNKNOWN };
}
