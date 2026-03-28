import { FastifyInstance } from 'fastify';

export async function transactionsRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const { orgId, status, page: pageStr, limit: limitStr } = request.query as {
      orgId?: string; status?: string; page?: string; limit?: string;
    };
    const page = Math.max(1, Number(pageStr) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitStr) || 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (orgId) where.orgId = orgId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      app.prisma.transaction.findMany({ where: where as any, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      app.prisma.transaction.count({ where: where as any }),
    ]);

    return reply.send({ data, total, page, limit });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await app.prisma.transaction.findUnique({ where: { id } });
    if (!tx) return reply.status(404).send({ error: 'Not found' });
    return reply.send(tx);
  });

  app.post('/:id/reprocess', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await app.prisma.transaction.findUnique({ where: { id } });
    if (!tx) return reply.status(404).send({ error: 'Not found' });

    const queue = app.queues?.['inbound-edi'];
    if (queue) {
      await queue.add('process-inbound', {
        rawEdi: tx.rawEdi,
        tradingPartnerId: tx.tradingPartnerId,
        orgId: tx.orgId,
      });
    }

    return reply.send({ transactionId: tx.id, queued: true });
  });
}
