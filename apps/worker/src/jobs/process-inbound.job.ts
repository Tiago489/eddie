import { createHash } from 'crypto';
import type { PrismaClient } from '@edi-platform/db';
import { X12Parser } from '@edi-platform/edi-core';
import { toJedi204, toJedi997, JsonataEvaluator, validateTmsOutput, defaultTmsSchema } from '@edi-platform/jedi';

export interface InboundJobPayload {
  rawEdi: string;
  tradingPartnerId: string;
  orgId: string;
}

export interface InboundJobDeps {
  prisma: PrismaClient;
  queues: { ack997: { add: (name: string, data: unknown) => Promise<void> } };
  httpClient?: typeof fetch;
}

export interface InboundJobResult {
  success: boolean;
  transactionId: string;
}

const parser = new X12Parser();
const evaluator = new JsonataEvaluator();

function mapTransactionSet(tsId: string): string {
  const map: Record<string, string> = {
    '204': 'EDI_204',
    '211': 'EDI_211',
    '214': 'EDI_214',
    '210': 'EDI_210',
    '990': 'EDI_990',
    '997': 'EDI_997',
  };
  return map[tsId] ?? 'EDI_204';
}

export async function processInboundJob(
  payload: InboundJobPayload,
  deps: InboundJobDeps,
): Promise<InboundJobResult> {
  const { rawEdi, tradingPartnerId, orgId } = payload;
  const { prisma } = deps;

  // Parse
  const parseResult = parser.parse(rawEdi);
  if (!parseResult.success) {
    const tx = await prisma.transaction.create({
      data: {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        status: 'FAILED',
        rawEdi,
        errorMessage: `${parseResult.error} [${parseResult.code}]`,
        isaControlNumber: '',
        contentHash: createHash('sha256').update(rawEdi).digest('hex'),
      },
    });
    return { success: false, transactionId: tx.id };
  }

  const { data } = parseResult;
  const contentHash = createHash('sha256').update(rawEdi).digest('hex');
  const transactionSet = mapTransactionSet(data.transactionSetId);

  // Duplicate detection
  const existing = await prisma.transaction.findFirst({
    where: { contentHash, status: { not: 'DUPLICATE' } },
  });
  if (existing) {
    const dupTx = await prisma.transaction.create({
      data: {
        orgId,
        tradingPartnerId,
        contentHash,
        isaControlNumber: existing.isaControlNumber,
        transactionSet: existing.transactionSet,
        direction: 'INBOUND',
        status: 'DUPLICATE',
        rawEdi,
      },
    });
    return { success: true, transactionId: dupTx.id };
  }

  // Create transaction
  const tx = await prisma.transaction.create({
    data: {
      orgId,
      tradingPartnerId,
      transactionSet,
      direction: 'INBOUND',
      status: 'RECEIVED',
      rawEdi,
      isaControlNumber: data.isaControlNumber,
      contentHash,
    },
  });

  // Transform to JEDI
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'MAPPING' },
  });

  const jediResult =
    data.transactionSetId === '997' ? toJedi997(data) : toJedi204(data);

  if (!jediResult.success) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'FAILED', errorMessage: jediResult.error },
    });
    return { success: false, transactionId: tx.id };
  }

  const jediPayload = jediResult.output;
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { jediPayload: jediPayload as object },
  });

  // Apply mapping
  const mapping = await prisma.mapping.findFirst({
    where: {
      orgId,
      transactionSet,
      direction: 'INBOUND',
      isActive: true,
    },
  });

  let outboundPayload: unknown = jediPayload;
  if (mapping) {
    const mapResult = await evaluator.evaluate<unknown>(
      mapping.jsonataExpression,
      jediPayload,
    );
    if (mapResult.success) {
      outboundPayload = mapResult.output;
    } else {
      await prisma.transactionEvent.create({
        data: {
          transactionId: tx.id,
          type: 'MAPPING_WARNING',
          message: `Mapping evaluation failed, using raw JEDI: ${mapResult.error}`,
          metadata: { mappingId: mapping.id, expression: mapResult.expression },
        },
      });
    }
  }

  // Validate output shape (warn only — do not block delivery)
  if (mapping) {
    const validation = validateTmsOutput(outboundPayload, defaultTmsSchema);
    if (!validation.valid) {
      await prisma.transactionEvent.create({
        data: {
          transactionId: tx.id,
          type: 'MAPPING_WARNING',
          message: `Output validation warnings: ${validation.errors.join('; ')}`,
          metadata: { mappingId: mapping.id, validationErrors: validation.errors },
        },
      });
    }
  }

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { outboundPayload: outboundPayload as object },
  });

  // Deliver downstream
  const downstreamApi = await prisma.downstreamApi.findFirst({
    where: { orgId },
  });

  if (downstreamApi) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'DELIVERING' },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), downstreamApi.timeoutMs);

    try {
      const http = deps.httpClient ?? fetch;
      const res = await http(downstreamApi.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outboundPayload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      await prisma.transaction.update({
        where: { id: tx.id },
        data: { downstreamStatusCode: res.status },
      });

      if (!res.ok) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            status: 'FAILED',
            errorMessage: `Downstream returned ${res.status}`,
          },
        });
        return { success: false, transactionId: tx.id };
      }
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED', errorMessage: msg },
      });
      return { success: false, transactionId: tx.id };
    }
  }

  // Success
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'DELIVERED' },
  });

  await deps.queues.ack997.add('send-997', { transactionId: tx.id });

  return { success: true, transactionId: tx.id };
}
