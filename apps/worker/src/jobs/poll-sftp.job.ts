import { createHash } from 'crypto';
import type { PrismaClient } from '@edi-platform/db';
import type { FileTransport } from '@edi-platform/types';

export interface PollSftpPayload {
  sftpConnectionId: string;
}

export interface PollSftpDeps {
  prisma: PrismaClient;
  transport?: FileTransport;
  queues: { inboundEdi: { add: (name: string, data: unknown) => Promise<void> } };
}

export interface PollSftpResult {
  success: boolean;
  filesFound: number;
  filesEnqueued: number;
  filesSkipped: number;
  error?: string;
}

export async function pollSftpJob(
  payload: PollSftpPayload,
  deps: PollSftpDeps,
): Promise<PollSftpResult> {
  const { prisma } = deps;

  const conn = await prisma.sftpConnection.findUnique({
    where: { id: payload.sftpConnectionId },
    include: { tradingPartner: true },
  });

  if (!conn) {
    return {
      success: false,
      filesFound: 0,
      filesEnqueued: 0,
      filesSkipped: 0,
      error: 'SftpConnection not found',
    };
  }

  const transport = deps.transport!;

  const filePaths = await transport.listFiles(conn.remotePath, conn.filePattern ?? '*.edi');

  let filesEnqueued = 0;
  let filesSkipped = 0;

  for (const filePath of filePaths) {
    const content = await transport.getFile(filePath);
    const contentHash = createHash('sha256').update(content).digest('hex');

    const existing = await prisma.transaction.findFirst({
      where: {
        contentHash,
        status: { notIn: ['DUPLICATE', 'FAILED'] },
      },
    });

    const fileName = filePath.split('/').pop() ?? filePath;

    if (existing) {
      filesSkipped++;
    } else {
      await deps.queues.inboundEdi.add('process-inbound', {
        rawEdi: content.toString(),
        tradingPartnerId: conn.tradingPartnerId,
        orgId: conn.tradingPartner.orgId,
        sourceFile: fileName,
      });
      filesEnqueued++;
    }

    await transport.archiveFile(filePath, `${conn.archivePath}/${fileName}`);
  }

  return {
    success: true,
    filesFound: filePaths.length,
    filesEnqueued,
    filesSkipped,
  };
}
