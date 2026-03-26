import { FastifyInstance } from 'fastify';

export async function tradingPartnersRoutes(app: FastifyInstance) {
  app.get('/', async (_request, _reply) => {
    return { data: [], total: 0 };
  });

  app.get('/:id', async (_request, _reply) => {
    return { data: null };
  });

  app.post('/', async (_request, _reply) => {
    return { data: null };
  });

  app.put('/:id', async (_request, _reply) => {
    return { data: null };
  });

  app.delete('/:id', async (_request, _reply) => {
    return { success: true };
  });
}
