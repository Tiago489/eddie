import { createHash } from 'crypto';
import type { PrismaClient } from '@edi-platform/db';
import type { FileTransport } from '@edi-platform/types';
import type { Logger } from '../lib/logger';
import { consoleLogger } from '../lib/logger';

export interface PollSftpPayload {
  sftpConnectionId: string;
}

export interface PollSftpDeps {
  prisma: PrismaClient;
  transport?: FileTransport;
  queues: { inboundEdi: { add: (name: string, data: unknown) => Promise<void> } };
  logger?: Logger;
}

export interface PollSftpResult {
  success: boolean;
  filesFound: number;
  filesEnqueued: number;
  filesSkipped: number;
  error?: string;
  errors?: Array<{ file: string; error: string }>;
}

export async function pollSftpJob(
  payload: PollSftpPayload,
  deps: PollSftpDeps,
): Promise<PollSftpResult> {
  const { prisma } = deps;
  const logger = deps.logger ?? consoleLogger;

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

  logger.info(`Polling ${conn.host}:${conn.port} ${conn.remotePath}`);

  const transport = deps.transport!;

  let filePaths: string[];
  try {
    filePaths = await transport.listFiles(conn.remotePath, conn.filePattern ?? '*.edi');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`SFTP listFiles failed for ${conn.host}:${conn.port}: ${msg}`);
    return {
      success: false,
      filesFound: 0,
      filesEnqueued: 0,
      filesSkipped: 0,
      error: `listFiles failed: ${msg}`,
    };
  }

  const fileWord = filePaths.length === 1 ? 'file' : 'files';
  logger.info(`Found ${filePaths.length} ${fileWord} on ${conn.host}:${conn.port}`);

  let filesEnqueued = 0;
  let filesSkipped = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (const filePath of filePaths) {
    try {
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
        logger.info(`${fileName} skipped — duplicate`);
      } else {
        await deps.queues.inboundEdi.add('process-inbound', {
          rawEdi: content.toString(),
          tradingPartnerId: conn.tradingPartnerId,
          orgId: conn.tradingPartner.orgId,
          sourceFile: fileName,
        });
        filesEnqueued++;
        logger.info(`${fileName} enqueued`);
      }

      await transport.archiveFile(filePath, `${conn.archivePath}/${fileName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to process file ${filePath}: ${msg}`);
      errors.push({ file: filePath, error: msg });
    }
  }

  return {
    success: errors.length === 0,
    filesFound: filePaths.length,
    filesEnqueued,
    filesSkipped,
    errors: errors.length > 0 ? errors : undefined,
  };
}
