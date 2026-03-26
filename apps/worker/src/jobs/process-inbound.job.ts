import type { InboundJobPayload, ParseResult } from '@edi-platform/types';

export interface InboundResult {
  transactionId: string;
  status: 'DELIVERED' | 'FAILED' | 'DUPLICATE';
}

export async function processInbound(_payload: InboundJobPayload): Promise<InboundResult> {
  throw new Error('Not implemented');
}
