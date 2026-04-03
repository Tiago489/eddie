import type { PrismaClient } from '@edi-platform/db';
import type { FileTransport } from '@edi-platform/types';
import type { JediDocument } from '@edi-platform/jedi';

export interface Send997Payload {
  transactionId: string;
}

export interface Send997Deps {
  prisma: PrismaClient;
  transport?: FileTransport;
}

export interface Send997Result {
  success: boolean;
  error?: string;
}

const SEP = '*';
const TERM = '~';

function seg(...elements: string[]): string {
  return elements.join(SEP) + TERM;
}

function pad(value: string, length: number): string {
  return value.padEnd(length, ' ').substring(0, length);
}

export async function send997Job(
  payload: Send997Payload,
  deps: Send997Deps,
): Promise<Send997Result> {
  const { prisma } = deps;

  const tx = await prisma.transaction.findUnique({
    where: { id: payload.transactionId },
    include: { tradingPartner: true },
  });

  if (!tx) {
    return { success: false, error: `Transaction not found: ${payload.transactionId}` };
  }

  if (!tx.jediPayload) {
    return { success: false, error: 'Transaction has no jediPayload to generate 997 from' };
  }

  const sftpConn = await prisma.sftpConnection.findFirst({
    where: { tradingPartnerId: tx.tradingPartnerId, isActive: true },
  });

  if (!sftpConn) {
    return { success: false, error: 'No active SFTP connection for trading partner' };
  }

  // Extract envelope from jediPayload
  const jedi = tx.jediPayload as unknown as JediDocument;
  const interchange = jedi.interchanges?.[0];
  const now = new Date();
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '').slice(0, 6);
  const hhmm = now.toISOString().slice(11, 16).replace(':', '');
  const controlNum = String(Date.now() % 1000000000).padStart(9, '0');

  // Swap sender/receiver for outbound 997
  const senderId = interchange?.ISA_08_InterchangeReceiverId ?? '';
  const receiverId = interchange?.ISA_06_InterchangeSenderId ?? '';
  const tsId = tx.transactionSet.replace('EDI_', '');

  const segments = [
    seg('ISA', '00', pad('', 10), '00', pad('', 10), 'ZZ', pad(senderId, 15), 'ZZ', pad(receiverId, 15), yymmdd, hhmm, 'U', '00401', controlNum, '0', 'P', '>'),
    seg('GS', 'FA', senderId, receiverId, '20' + yymmdd, hhmm, controlNum.slice(-6), 'X', '004010'),
    seg('ST', '997', '0001'),
    seg('AK1', 'SM', tx.isaControlNumber),
    seg('AK2', tsId, '0001'),
    seg('AK5', 'A'),
    seg('AK9', 'A', '1', '1', '1'),
    seg('SE', '5', '0001'),
    seg('GE', '1', controlNum.slice(-6)),
    seg('IEA', '1', controlNum),
  ];

  const edi997 = segments.join('\n');

  const transport = deps.transport!;
  const filename = `997_${tx.isaControlNumber}_${Date.now()}.edi`;
  const outDir = sftpConn.outboundRemotePath ?? sftpConn.remotePath;
  const path = `${outDir}/${filename}`;

  try {
    await transport.putFile(path, Buffer.from(edi997));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to write 997 to ${path}: ${msg}` };
  }

  await prisma.transactionEvent.create({
    data: {
      transactionId: tx.id,
      type: '997_SENT',
      message: `997 written to ${path}`,
      metadata: { filename, path },
    },
  });

  return { success: true };
}
