import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';

export interface Ts990Data {
  transactionSetId: '990';
  billOfLading?: string;
  stops: unknown[];
}

export function parseTs990(_segments: string[][]): ParseResult<Ts990Data> {
  return { success: false, error: 'Not implemented', code: ParseErrorCode.UNKNOWN };
}
