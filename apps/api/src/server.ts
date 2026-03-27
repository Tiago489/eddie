import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@edi-platform/db';
import { tradingPartnersRoutes } from './routes/trading-partners';
import { sftpConnectionsRoutes } from './routes/sftp-connections';
import { mappingsRoutes } from './routes/mappings';
import { downstreamApisRoutes } from './routes/downstream-apis';
import { transactionsRoutes } from './routes/transactions';
import { outboundRoutes } from './routes/outbound';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    queues: Record<string, { add: (name: string, data: unknown) => Promise<void> }>;
  }
}

export interface AppOptions {
  prisma: PrismaClient;
  queues?: Record<string, { add: (name: string, data: unknown) => Promise<void> }>;
  logger?: boolean | object;
}

export function buildApp(opts?: AppOptions): FastifyInstance {
  const app = Fastify({ logger: opts?.logger ?? true });

  if (opts?.prisma) {
    app.decorate('prisma', opts.prisma);
  }
  if (opts?.queues) {
    app.decorate('queues', opts.queues);
  }

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  app.register(tradingPartnersRoutes, { prefix: '/api/trading-partners' });
  app.register(sftpConnectionsRoutes, { prefix: '/api/sftp-connections' });
  app.register(mappingsRoutes, { prefix: '/api/mappings' });
  app.register(downstreamApisRoutes, { prefix: '/api/downstream-apis' });
  app.register(transactionsRoutes, { prefix: '/api/transactions' });
  app.register(outboundRoutes, { prefix: '/api/outbound' });

  return app;
}

if (require.main === module) {
  const { PrismaClient } = require('@edi-platform/db');
  const prisma = new PrismaClient();
  const app = buildApp({ prisma });
  const port = Number(process.env.API_PORT) || 3001;
  const host = process.env.API_HOST || '0.0.0.0';

  app.listen({ port, host }).then(() => {
    console.log(`API server running on ${host}:${port}`);
  });
}
