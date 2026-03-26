export interface JediDocument {
  transactionSet: string;
  version: string;
  sender: { isaId: string; name?: string };
  receiver: { isaId: string; name?: string };
  controlNumber: string;
  timestamp: string;
  data: Record<string, unknown>;
}
