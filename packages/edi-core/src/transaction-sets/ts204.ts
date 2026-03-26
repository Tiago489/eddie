import type { ParseResult } from '@edi-platform/types';
import { ParseErrorCode } from '@edi-platform/types';

export interface Ts204Data {
  transactionSetId: '204';
  billOfLading?: string;
  stops: unknown[];
}

export function parseTs204(_segments: string[][]): ParseResult<Ts204Data> {
  return { success: false, error: 'Not implemented', code: ParseErrorCode.UNKNOWN };
}
