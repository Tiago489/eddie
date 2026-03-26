import { FastifyInstance } from 'fastify';

export async function transactionsRoutes(app: FastifyInstance) {
  app.get('/', async (_request, _reply) => {
    return { data: [], total: 0 };
  });

  app.get('/:id', async (_request, _reply) => {
    return { data: null };
  });

  // Reprocess a transaction
  app.post('/:id/reprocess', async (_request, _reply) => {
    return { success: true };
  });
}
