import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@edi-platform/db';
import { SftpTransport } from '@edi-platform/sftp';
import { QUEUE_NAMES } from './queues';
import { schedulePollers } from './scheduler';
import { consoleLogger } from './lib/logger';
import { decrypt } from './lib/crypto';
import { pollSftpJob } from './jobs/poll-sftp.job';
import { processInboundJob } from './jobs/process-inbound.job';
import { processOutboundJob } from './jobs/process-outbound.job';
import { send997Job } from './jobs/send-997.job';

export { queues } from './queues';

const logger = consoleLogger;

function createTransport(conn: { host: string; port: number; username: string; encryptedPassword: string }) {
  return new SftpTransport({
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: decrypt(conn.encryptedPassword),
  });
}

async function main() {
  logger.info('Worker started');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  const prisma = new PrismaClient();

  const sftpPollQueue = new Queue(QUEUE_NAMES.SFTP_POLL, { connection: redis });
  const inboundEdiQueue = new Queue(QUEUE_NAMES.INBOUND_EDI, { connection: redis });
  const ack997Queue = new Queue(QUEUE_NAMES.ACK_997, { connection: redis });

  const count = await schedulePollers(prisma, sftpPollQueue, logger);
  logger.info(`Scheduled ${count} poller(s)`);

  new Worker(QUEUE_NAMES.SFTP_POLL, async (job) => {
    try {
      const result = await pollSftpJob(
        { sftpConnectionId: job.data.sftpConnectionId },
        { prisma, createTransport, queues: { inboundEdi: inboundEdiQueue }, logger },
      );

      if (!result.success) {
        logger.error(`Poll failed: ${result.error ?? 'file errors'}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Poll error: ${msg}`);
      throw err;
    }
  }, { connection: redis });

  new Worker(QUEUE_NAMES.INBOUND_EDI, async (job) => {
    logger.info(`Processing inbound EDI job ${job.id}`);
    try {
      const result = await processInboundJob(job.data, {
        prisma,
        queues: { ack997: ack997Queue },
      });
      if (result.success) {
        logger.info(`Inbound job ${job.id} succeeded — transaction ${result.transactionId}`);
      } else {
        logger.error(`Inbound job ${job.id} failed — transaction ${result.transactionId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error(`Inbound job ${job.id} threw: ${msg}${stack ? '\n' + stack : ''}`);
      throw err;
    }
  }, { connection: redis });

  new Worker(QUEUE_NAMES.OUTBOUND_EDI, async (job) => {
    logger.info(`Processing outbound EDI job ${job.id}`);
    try {
      const result = await processOutboundJob(job.data, {
        prisma,
        queues: {},
      });
      if (result.success) {
        logger.info(`Outbound job ${job.id} succeeded — transaction ${result.transactionId}`);
      } else {
        logger.error(`Outbound job ${job.id} failed — transaction ${result.transactionId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error(`Outbound job ${job.id} threw: ${msg}${stack ? '\n' + stack : ''}`);
      throw err;
    }
  }, { connection: redis });

  new Worker(QUEUE_NAMES.ACK_997, async (job) => {
    logger.info(`Processing 997 ack job ${job.id}`);
    try {
      const result = await send997Job(job.data, { prisma, createTransport });
      if (result.success) {
        logger.info(`997 ack job ${job.id} succeeded`);
      } else {
        logger.error(`997 ack job ${job.id} failed: ${result.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error(`997 ack job ${job.id} threw: ${msg}${stack ? '\n' + stack : ''}`);
      throw err;
    }
  }, { connection: redis });

  logger.info('Workers registered — waiting for jobs');
}

main().catch((err) => {
  logger.error(`Worker failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
