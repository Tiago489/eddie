import { createHash } from 'crypto';
import type { PrismaClient } from '@edi-platform/db';
import { JsonataEvaluator, fromJedi990, fromJedi214, fromJedi210 } from '@edi-platform/jedi';
import type { JediDocument } from '@edi-platform/jedi';

export interface OutboundJobPayload {
  orgId: string;
  tradingPartnerId: string;
  transactionSet: string;
  payload: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface OutboundJobDeps {
  prisma: PrismaClient;
  queues: Record<string, never>;
  httpClient?: typeof fetch;
}

export interface OutboundJobResult {
  success: boolean;
  transactionId: string;
}

const evaluator = new JsonataEvaluator();

export async function processOutboundJob(
  payload: OutboundJobPayload,
  deps: OutboundJobDeps,
): Promise<OutboundJobResult> {
  const { orgId, tradingPartnerId, transactionSet } = payload;
  const { prisma } = deps;

  const validSets = new Set(['EDI_204', 'EDI_211', 'EDI_214', 'EDI_210', 'EDI_990', 'EDI_997']);
  if (!validSets.has(transactionSet)) {
    // Create a record with a fallback transaction set so we can track the failure
    const tx = await prisma.transaction.create({
      data: {
        orgId,
        tradingPartnerId,
        transactionSet: 'EDI_997',
        direction: 'OUTBOUND',
        status: 'FAILED',
        isaControlNumber: '',
        contentHash: createHash('sha256').update(JSON.stringify(payload.payload)).digest('hex'),
        errorMessage: `Unsupported transaction set: ${transactionSet}`,
      },
    });
    return { success: false, transactionId: tx.id };
  }

  // Create transaction
  const contentHash = createHash('sha256').update(JSON.stringify(payload.payload)).digest('hex');
  const tx = await prisma.transaction.create({
    data: {
      orgId,
      tradingPartnerId,
      transactionSet: transactionSet as 'EDI_204' | 'EDI_211' | 'EDI_214' | 'EDI_210' | 'EDI_990' | 'EDI_997',
      direction: 'OUTBOUND',
      status: 'RECEIVED',
      isaControlNumber: '',
      contentHash,
    },
  });

  // Apply mapping
  const mapping = await prisma.mapping.findFirst({
    where: { orgId, transactionSet: transactionSet as never, direction: 'OUTBOUND', isActive: true },
  });

  let jediPayload: unknown = payload.payload;

  if (mapping) {
    const mapResult = await evaluator.evaluate<unknown>(mapping.jsonataExpression, payload.payload);
    if (!mapResult.success) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED', errorMessage: mapResult.error },
      });
      return { success: false, transactionId: tx.id };
    }
    jediPayload = mapResult.output;
  }

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'MAPPING', jediPayload: jediPayload as object },
  });

  // Generate EDI
  let ediResult: { success: boolean; output?: string; error?: string };

  switch (transactionSet) {
    case 'EDI_990':
      ediResult = fromJedi990(jediPayload as JediDocument);
      break;
    case 'EDI_214':
      ediResult = fromJedi214(jediPayload as JediDocument, {
        statusCode: (payload.options?.statusCode as string) ?? 'AF',
        statusReason: (payload.options?.statusReason as string) ?? 'AA',
      });
      break;
    case 'EDI_210':
      ediResult = fromJedi210(jediPayload as JediDocument, {
        invoiceNumber: (payload.options?.invoiceNumber as string) ?? '',
        totalCharges: (payload.options?.totalCharges as number) ?? 0,
      });
      break;
    default:
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED', errorMessage: `Unsupported transaction set: ${transactionSet}` },
      });
      return { success: false, transactionId: tx.id };
  }

  if (!ediResult.success) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'FAILED', errorMessage: ediResult.error ?? 'EDI generation failed' },
    });
    return { success: false, transactionId: tx.id };
  }

  const rawEdi = ediResult.output!;
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { rawEdi },
  });

  // Deliver
  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'DELIVERING' },
  });

  const downstreamApi = await prisma.downstreamApi.findFirst({ where: { orgId } });
  if (!downstreamApi) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { status: 'FAILED', errorMessage: 'No downstream API configured' },
    });
    return { success: false, transactionId: tx.id };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), downstreamApi.timeoutMs);

  try {
    const http = deps.httpClient ?? fetch;
    const res = await http(downstreamApi.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawEdi,
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
        data: { status: 'FAILED', errorMessage: `Downstream returned ${res.status}` },
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

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'DELIVERED' },
  });

  return { success: true, transactionId: tx.id };
}
