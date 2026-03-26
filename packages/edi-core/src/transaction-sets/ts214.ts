import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';

export interface Ts214Data {
  transactionSetId: '214';
  billOfLading?: string;
  stops: unknown[];
}

export function parseTs214(_segments: string[][]): ParseResult<Ts214Data> {
  return { success: false, error: 'Not implemented', code: ParseErrorCode.UNKNOWN };
}
