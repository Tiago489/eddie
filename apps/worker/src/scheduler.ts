import type { PrismaClient } from '@edi-platform/db';

export interface SchedulerQueue {
  add: (name: string, data: unknown, opts?: { repeat?: { every: number }; jobId?: string }) => Promise<void>;
}

export async function schedulePollers(
  prisma: PrismaClient,
  sftpPollQueue: SchedulerQueue,
): Promise<number> {
  const activeConnections = await prisma.sftpConnection.findMany({
    where: { isActive: true },
  });

  for (const conn of activeConnections) {
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
