export interface InboundJobPayload {
  sftpConnectionId: string;
  tradingPartnerId: string;
  orgId: string;
  fileName: string;
  rawEdi: string;
}

export interface OutboundJobPayload {
  orgId: string;
  tradingPartnerId: string;
  transactionSet: string;
  jediPayload: Record<string, unknown>;
}
