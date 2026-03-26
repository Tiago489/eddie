import { FastifyInstance } from 'fastify';

export async function outboundRoutes(app: FastifyInstance) {
  app.post('/:transactionSet', async (_request, _reply) => {
    return { transactionId: null, status: 'queued' };
  });
}
