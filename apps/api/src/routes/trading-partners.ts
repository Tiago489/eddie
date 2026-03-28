import { FastifyInstance } from 'fastify';

export async function tradingPartnersRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['orgId', 'name', 'isaId', 'direction'],
        properties: {
          orgId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          isaId: { type: 'string', minLength: 1, maxLength: 15 },
          direction: { type: 'string', enum: ['INBOUND', 'OUTBOUND', 'BOTH'] },
        },
      },
    },
  }, async (request, reply) => {
    const { orgId, name, isaId, direction } = request.body as {
      orgId: string; name: string; isaId: string; direction: string;
    };
    const tp = await app.prisma.tradingPartner.create({
      data: { orgId, name, isaId, direction: direction as 'INBOUND' | 'OUTBOUND' | 'BOTH', isActive: true },
    });
    return reply.status(201).send(tp);
  });

  app.get('/', async (request, reply) => {
    const { orgId } = request.query as { orgId?: string };
    const data = await app.prisma.tradingPartner.findMany({
      where: { orgId, isActive: true },
    });
    return reply.send({ data });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tp = await app.prisma.tradingPartner.findUnique({ where: { id } });
    if (!tp) return reply.status(404).send({ error: 'Not found' });
    return reply.send(tp);
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.tradingPartner.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const body = request.body as Record<string, unknown>;
    const tp = await app.prisma.tradingPartner.update({
      where: { id },
      data: body,
    });
    return reply.send(tp);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.tradingPartner.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await app.prisma.tradingPartner.update({
      where: { id },
      data: { isActive: false },
    });
    return reply.send({ success: true });
  });
}
