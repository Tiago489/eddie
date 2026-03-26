import { describe, it, expect } from 'vitest';
import { buildApp } from '../server';

describe('Trading Partners API', () => {
  it('GET /api/trading-partners should return empty list', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/trading-partners',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], total: 0 });
  });

  it('POST /api/trading-partners should return null data stub', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/trading-partners',
      payload: { name: 'Test Partner', isaId: 'TESTISA', direction: 'INBOUND' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: null });
  });
});
