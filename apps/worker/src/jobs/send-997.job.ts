export interface Send997JobData {
  transactionId: string;
  isaControlNumber: string;
  gsControlNumber: string;
  accepted: boolean;
}

export async function processSend997(_data: Send997JobData): Promise<void> {
  throw new Error('Not implemented');
}
