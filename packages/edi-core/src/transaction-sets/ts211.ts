import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';

export interface Ts211Data {
  transactionSetId: '211';
  billOfLading?: string;
  stops: unknown[];
}

export function parseTs211(_segments: string[][]): ParseResult<Ts211Data> {
  return { success: false, error: 'Not implemented', code: ParseErrorCode.UNKNOWN };
}
