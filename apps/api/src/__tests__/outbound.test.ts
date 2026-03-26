import { describe, it, expect } from 'vitest';
import { buildApp } from '../server';

describe('Outbound API', () => {
  it('POST /api/outbound/204 should return queued status', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/outbound/204',
      payload: { tradingPartnerId: 'tp-1', jediPayload: {} },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transactionId: null, status: 'queued' });
  });
});
