import type { OutboundJobPayload } from '@edi-platform/types';

export interface OutboundResult {
  transactionId: string;
  rawEdi: string;
}

export async function processOutbound(_payload: OutboundJobPayload): Promise<OutboundResult> {
  throw new Error('Not implemented');
}
