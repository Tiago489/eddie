import { FastifyInstance } from 'fastify';

export async function tradingPartnersRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['orgId', 'name', 'isaId', 'gsId', 'direction'],
        properties: {
          orgId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          isaId: { type: 'string', minLength: 1, maxLength: 15 },
          gsId: { type: 'string', minLength: 1 },
          direction: { type: 'string', enum: ['INBOUND', 'OUTBOUND', 'BOTH'] },
        },
      },
    },
  }, async (request, reply) => {
    const { orgId, name, isaId, gsId, direction } = request.body as {
      orgId: string; name: string; isaId: string; gsId: string; direction: string;
    };
    const existing = await app.prisma.tradingPartner.findFirst({ where: { isaId, orgId } });
    if (existing && existing.isActive) {
      return reply.status(409).send({ error: 'A trading partner with this ISA ID already exists' });
    }
    if (existing && !existing.isActive) {
      const tp = await app.prisma.tradingPartner.update({
        where: { id: existing.id },
        data: { name, gsId, direction: direction as 'INBOUND' | 'OUTBOUND' | 'BOTH', isActive: true },
      });
      return reply.status(200).send(tp);
    }
    const tp = await app.prisma.tradingPartner.create({
      data: { orgId, name, isaId, gsId, direction: direction as 'INBOUND' | 'OUTBOUND' | 'BOTH', isActive: true },
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

  app.patch('/:id', async (request, reply) => {
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

  app.post('/:id/mappings', {
    schema: {
      body: {
        type: 'object',
        required: ['mappingIds'],
        properties: {
          mappingIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mappingIds } = request.body as { mappingIds: string[] };
    const tp = await app.prisma.tradingPartner.findUnique({ where: { id } });
    if (!tp) return reply.status(404).send({ error: 'Trading partner not found' });

    const result = await app.prisma.mapping.updateMany({
      where: { id: { in: mappingIds } },
      data: { tradingPartnerId: id },
    });

    return reply.send({ updated: result.count });
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
