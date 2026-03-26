export interface PollSftpJobData {
  sftpConnectionId: string;
  tradingPartnerId: string;
  orgId: string;
}

export async function processPollSftp(_data: PollSftpJobData): Promise<void> {
  throw new Error('Not implemented');
}
