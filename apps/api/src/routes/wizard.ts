import { FastifyInstance } from 'fastify';
import { X12Parser } from '@edi-platform/edi-core';
import { toJedi204, toJedi997, JsonataEvaluator } from '@edi-platform/jedi';
import { createHash } from 'crypto';

const parser = new X12Parser();
const evaluator = new JsonataEvaluator();

export async function wizardRoutes(app: FastifyInstance) {
  // Parse raw EDI and return JEDI
  app.post('/parse', {
    schema: {
      body: {
        type: 'object',
        required: ['rawEdi', 'orgId'],
        properties: {
          rawEdi: { type: 'string', minLength: 1 },
          orgId: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { rawEdi, orgId } = request.body as { rawEdi: string; orgId: string };

    const parseResult = parser.parse(rawEdi);
    if (!parseResult.success) {
      return reply.send({
        success: false,
        error: parseResult.error,
        code: parseResult.code,
      });
    }

    const { data } = parseResult;

    // Detect delimiters from raw EDI
    const elementSep = rawEdi[3] || '*';
    const lastIsaChar = rawEdi.substring(105, 106);
    const segmentTerm = rawEdi[106] || lastIsaChar || '~';

    // Transform to JEDI
    const jediResult = data.transactionSetId === '997'
      ? toJedi997(data)
      : toJedi204(data);

    if (!jediResult.success) {
      return reply.send({
        success: false,
        error: jediResult.error,
        code: 'TRANSFORM_FAILED',
      });
    }

    return reply.send({
      success: true,
      transactionSet: data.transactionSetId,
      delimiters: { element: elementSep, segment: '~' },
      segmentCount: data.segments.length,
      warnings: parseResult.warnings,
      jedi: jediResult.output,
    });
  });

  // Send to downstream API (creates real transaction)
  app.post('/send', {
    schema: {
      body: {
        type: 'object',
        required: ['jedi', 'downstreamApiId', 'orgId'],
        properties: {
          jedi: { type: 'object' },
          mappingId: { type: ['string', 'null'] },
          downstreamApiId: { type: 'string', minLength: 1 },
          orgId: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { jedi, mappingId, downstreamApiId, orgId } = request.body as {
      jedi: Record<string, unknown>;
      mappingId: string | null;
      downstreamApiId: string;
      orgId: string;
    };

    // Apply mapping if selected
    let outboundPayload: unknown = jedi;
    if (mappingId) {
      const mapping = await app.prisma.mapping.findUnique({ where: { id: mappingId } });
      if (mapping) {
        const mapResult = await evaluator.evaluate<unknown>(mapping.jsonataExpression, jedi);
        if (mapResult.success) {
          outboundPayload = mapResult.output;
        }
      }
    }

    // Look up downstream API
    const downstreamApi = await app.prisma.downstreamApi.findUnique({
      where: { id: downstreamApiId },
    });
    if (!downstreamApi) {
      return reply.status(404).send({ success: false, error: 'Downstream API not found' });
    }

    // Find a trading partner for this org (use first active one)
    const tradingPartner = await app.prisma.tradingPartner.findFirst({
      where: { orgId, isActive: true },
    });

    // Create transaction record
    const contentHash = createHash('sha256').update(JSON.stringify(jedi)).digest('hex');
    const tx = await app.prisma.transaction.create({
      data: {
        orgId,
        tradingPartnerId: tradingPartner?.id ?? 'wizard',
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        status: 'DELIVERING',
        jediPayload: jedi,
        outboundPayload: outboundPayload as object,
        isaControlNumber: 'WIZARD' + Date.now().toString().slice(-6),
        contentHash,
      },
    });

    // Send to downstream
    let downstreamResponse: { statusCode: number; body: string };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), downstreamApi.timeoutMs);
      const res = await fetch(downstreamApi.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outboundPayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.text();
      downstreamResponse = { statusCode: res.status, body };

      await app.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          downstreamStatusCode: res.status,
          status: res.ok ? 'DELIVERED' : 'FAILED',
          errorMessage: res.ok ? null : `Downstream returned ${res.status}`,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await app.prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED', errorMessage: msg },
      });
      return reply.send({
        success: false,
        transactionId: tx.id,
        error: msg,
      });
    }

    const updatedTx = await app.prisma.transaction.findUnique({ where: { id: tx.id } });

    return reply.send({
      success: updatedTx?.status === 'DELIVERED',
      transactionId: tx.id,
      status: updatedTx?.status,
      outboundPayload,
      downstreamResponse,
    });
  });
}
