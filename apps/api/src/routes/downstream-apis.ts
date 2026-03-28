import { FastifyInstance } from 'fastify';
import { encrypt } from '../lib/crypto';

function omitCredentials(record: Record<string, unknown>) {
  const { encryptedCredentials, ...rest } = record;
  return rest;
}

export async function downstreamApisRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['orgId', 'name', 'baseUrl', 'authType'],
        properties: {
          orgId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          baseUrl: { type: 'string', minLength: 1 },
          authType: { type: 'string', enum: ['NONE', 'API_KEY', 'BEARER', 'BASIC'] },
          credentials: { type: 'string' },
          timeoutMs: { type: 'integer' },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { credentials, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (credentials) {
      data.encryptedCredentials = encrypt(credentials as string);
    }
    const record = await app.prisma.downstreamApi.create({ data: data as any });
    return reply.status(201).send(omitCredentials(record as unknown as Record<string, unknown>));
  });

  app.get('/', async (request, reply) => {
    const { orgId } = request.query as { orgId?: string };
    const data = await app.prisma.downstreamApi.findMany({
      where: orgId ? { orgId } : {},
    });
    return reply.send({ data: data.map((r) => omitCredentials(r as unknown as Record<string, unknown>)) });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await app.prisma.downstreamApi.findUnique({ where: { id } });
    if (!record) return reply.status(404).send({ error: 'Not found' });
    return reply.send(omitCredentials(record as unknown as Record<string, unknown>));
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.downstreamApi.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    const body = request.body as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};
    if (body.credentials) {
      updateData.encryptedCredentials = encrypt(body.credentials as string);
    }
    for (const [key, value] of Object.entries(body)) {
      if (key !== 'credentials') updateData[key] = value;
    }
    const record = await app.prisma.downstreamApi.update({ where: { id }, data: updateData as any });
    return reply.send(omitCredentials(record as unknown as Record<string, unknown>));
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.downstreamApi.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Not found' });
    await app.prisma.downstreamApi.delete({ where: { id } });
    return reply.send({ success: true });
  });
}
