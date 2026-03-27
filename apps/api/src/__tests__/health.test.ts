import { describe, it, expect } from 'vitest';
import { buildApp } from '../server';

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const app = buildApp({ logger: false } as Parameters<typeof buildApp>[0]);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
