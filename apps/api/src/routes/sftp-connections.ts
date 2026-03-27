import { FastifyInstance } from 'fastify';
import { encrypt } from '../lib/crypto';

function omitPassword(record: Record<string, unknown>) {
  const { encryptedPassword, ...rest } = record;
  return rest;
}

export async function sftpConnectionsRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { password, ...rest } = body;
    const data = {
      ...rest,
      encryptedPassword: encrypt(password as string),
    };
    const record = await app.prisma.sftpConnection.create({ data: data as any });
    return reply.status(201).send(omitPassword(record as unknown as Record<string, unknown>));
  });

  app.get('/', async (request, reply) => {
    const { tradingPartnerId } = request.query as { tradingPartnerId?: string };
    const data = await app.prisma.sftpConnection.findMany({
      where: tradingPartnerId ? { tradingPartnerId, isActive: true } : { isActive: true },
    });
    return reply.send({ data: data.map((r) => omitPassword(r as unknown as Record<string, unknown>)) });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await app.prisma.sftpConnection.findUnique({ where: { id } });
    if (!record) return reply.status(404).send({ error: 'Not found' });
    return reply.send(omitPassword(record as unknown as Record<string, unknown>));
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};
    if (body.password) {
      updateData.encryptedPassword = encrypt(body.password as string);
    }
    // Copy other fields except password
    for (const [key, value] of Object.entries(body)) {
      if (key !== 'password') updateData[key] = value;
    }
    const record = await app.prisma.sftpConnection.update({ where: { id }, data: updateData as any });
    return reply.send(omitPassword(record as unknown as Record<string, unknown>));
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await app.prisma.sftpConnection.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true });
  });
}
