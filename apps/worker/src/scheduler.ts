import type { PrismaClient } from '@edi-platform/db';
import type { Logger } from './lib/logger';
import { consoleLogger } from './lib/logger';

export interface SchedulerQueue {
  add: (name: string, data: unknown, opts?: { repeat?: { every: number }; jobId?: string }) => Promise<void>;
}

export async function schedulePollers(
  prisma: PrismaClient,
  sftpPollQueue: SchedulerQueue,
  logger: Logger = consoleLogger,
): Promise<number> {
  const activeConnections = await prisma.sftpConnection.findMany({
    where: { isActive: true },
  });

  if (activeConnections.length === 0) {
    logger.warn('No active SFTP connections found — polling not started');
    return 0;
  }

  logger.info(`Found ${activeConnections.length} active SFTP connection(s)`);

  for (const conn of activeConnections) {
    logger.info(`Scheduling poller for ${conn.host}:${conn.port} every ${conn.pollingIntervalSeconds}s`);
    await sftpPollQueue.add(
      'poll-' + conn.id,
      { sftpConnectionId: conn.id },
      {
        repeat: { every: conn.pollingIntervalSeconds * 1000 },
        jobId: 'poll-' + conn.id,
      },
    );
  }

  return activeConnections.length;
}
