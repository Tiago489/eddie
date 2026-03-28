import { FastifyInstance } from 'fastify';

const VALID_SETS = new Set(['EDI_204', 'EDI_211', 'EDI_214', 'EDI_210', 'EDI_990', 'EDI_997']);

export async function outboundRoutes(app: FastifyInstance) {
  app.post('/:transactionSet', {
    schema: {
      body: {
        type: 'object',
        required: ['orgId', 'tradingPartnerId', 'payload'],
        properties: {
          orgId: { type: 'string', minLength: 1 },
          tradingPartnerId: { type: 'string', minLength: 1 },
          payload: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    const { transactionSet } = request.params as { transactionSet: string };

    if (!VALID_SETS.has(transactionSet)) {
      return reply.status(400).send({ error: `Unknown transaction set: ${transactionSet}` });
    }

    const { orgId, tradingPartnerId, payload } = request.body as {
      orgId: string; tradingPartnerId: string; payload: unknown;
    };

    const queue = app.queues?.['outbound-edi'];
    if (queue) {
      await queue.add('process-outbound', {
        orgId,
        tradingPartnerId,
        transactionSet,
        payload,
      });
    }

    return reply.send({ queued: true, transactionSet });
  });
}
