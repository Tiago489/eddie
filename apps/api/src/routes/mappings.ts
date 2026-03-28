import { FastifyInstance } from 'fastify';
import { JsonataEvaluator } from '@edi-platform/jedi';

const evaluator = new JsonataEvaluator();

export async function mappingsRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['orgId', 'name', 'transactionSet', 'direction', 'jsonataExpression'],
        properties: {
          orgId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          transactionSet: { type: 'string', enum: ['EDI_204', 'EDI_211', 'EDI_214', 'EDI_210', 'EDI_990', 'EDI_997'] },
          direction: { type: 'string', enum: ['INBOUND', 'OUTBOUND'] },
          jsonataExpression: { type: 'string' },
          version: { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const record = await app.prisma.mapping.create({
      data: {
        orgId: body.orgId as string,
        name: body.name as string,
        transactionSet: body.transactionSet as any,
        direction: body.direction as any,
        jsonataExpression: body.jsonataExpression as string,
        version: Number(body.version) || 1,
        isActive: true,
      },
    });
    return reply.status(201).send(record);
  });

  app.get('/', async (request, reply) => {
    const { orgId, transactionSet } = request.query as { orgId?: string; transactionSet?: string };
    const where: Record<string, unknown> = {};
    if (orgId) where.orgId = orgId;
    if (transactionSet) where.transactionSet = transactionSet;
    const data = await app.prisma.mapping.findMany({ where: where as any });
    return reply.send({ data });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await app.prisma.mapping.findUnique({ where: { id } });
    if (!record) return reply.status(404).send({ error: 'Not found' });
    return reply.send(record);
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.mapping.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const body = request.body as Record<string, unknown>;
    const record = await app.prisma.mapping.update({ where: { id }, data: body as any });
    return reply.send(record);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.mapping.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await app.prisma.mapping.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true });
  });

  // Test mapping endpoint
  app.post('/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { input } = request.body as { input: unknown };
    const mapping = await app.prisma.mapping.findUnique({ where: { id } });
    if (!mapping) return reply.status(404).send({ error: 'Mapping not found' });

    const result = await evaluator.evaluate<unknown>(mapping.jsonataExpression, input);
    if (result.success) {
      return reply.send({ success: true, output: result.output });
    }
    return reply.send({ success: false, error: result.error });
  });
}
