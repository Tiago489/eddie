import Fastify from 'fastify';
import { tradingPartnersRoutes } from './routes/trading-partners';
import { sftpConnectionsRoutes } from './routes/sftp-connections';
import { mappingsRoutes } from './routes/mappings';
import { downstreamApisRoutes } from './routes/downstream-apis';
import { transactionsRoutes } from './routes/transactions';
import { outboundRoutes } from './routes/outbound';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(tradingPartnersRoutes, { prefix: '/api/trading-partners' });
  app.register(sftpConnectionsRoutes, { prefix: '/api/sftp-connections' });
  app.register(mappingsRoutes, { prefix: '/api/mappings' });
  app.register(downstreamApisRoutes, { prefix: '/api/downstream-apis' });
  app.register(transactionsRoutes, { prefix: '/api/transactions' });
  app.register(outboundRoutes, { prefix: '/api/outbound' });

  return app;
}

if (require.main === module) {
  const app = buildApp();
  const port = Number(process.env.API_PORT) || 3001;
  const host = process.env.API_HOST || '0.0.0.0';

  app.listen({ port, host }).then(() => {
    console.log(`API server running on ${host}:${port}`);
  });
}
